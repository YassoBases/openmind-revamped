import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'stage.dart';

/// Local session: server URL, device token, cached profile.
/// Data minimization: nickname only, never an email or real name.
class Session {
  Session._(this._prefs);
  static Session? _instance;
  final SharedPreferences _prefs;

  static const _defaultBaseUrl =
      String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:8080');

  static Future<Session> load() async {
    _instance ??= Session._(await SharedPreferences.getInstance());
    return _instance!;
  }

  static Session get instance => _instance!;

  String get baseUrl => _prefs.getString('baseUrl') ?? _defaultBaseUrl;
  Future<void> setBaseUrl(String url) =>
      _prefs.setString('baseUrl', url.trim().replaceAll(RegExp(r'/+$'), ''));

  String? get token => _prefs.getString('token');
  String? get studentId => _prefs.getString('studentId');

  Future<void> setAuth(String studentId, String token) async {
    await _prefs.setString('studentId', studentId);
    await _prefs.setString('token', token);
  }

  /// A random, persistent per-install identifier — sent as the idempotency
  /// key on `POST /students` ([RegistrationSync]) so a lost response (the
  /// server created the account but this device never received the reply)
  /// retries into the SAME account instead of a duplicate; the backend
  /// enforces this with a unique `installationId` column, not just this
  /// client's in-flight lock. Generated once and persisted immediately —
  /// awaited so the write is durable before the id is ever used in a
  /// request. Survives token expiry / re-registration (clearAuth): it
  /// identifies the physical install, not the account.
  Future<String> installationId() async {
    final existing = _prefs.getString('installationId');
    if (existing != null) return existing;
    final id = _generateInstallationId();
    await _prefs.setString('installationId', id);
    return id;
  }

  static String _generateInstallationId() {
    final rand = Random.secure();
    final bytes = List<int>.generate(16, (_) => rand.nextInt(256));
    return 'inst_${bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join()}';
  }

  Map<String, dynamic>? get profile {
    final raw = _prefs.getString('profile');
    return raw == null ? null : jsonDecode(raw) as Map<String, dynamic>;
  }

  /// Bumped on every profile write, so widgets outside the normal rebuild
  /// flow (e.g. the app-level mobile shell) can react to stage changes.
  static final ValueNotifier<int> revision = ValueNotifier(0);

  Future<void> setProfile(Map<String, dynamic> profile) async {
    await _prefs.setString('profile', jsonEncode(profile));
    revision.value++;
  }

  bool get onboarded => profile != null;
  bool get registered => token != null;

  String get language => (profile?['language'] as String?) ?? 'en';
  String get color => (profile?['color'] as String?) ?? '#58CC02';
  String get name => (profile?['name'] as String?) ?? 'Player';
  int get grade => (profile?['grade'] as num?)?.toInt() ?? 5;

  /// The learner's product mode. Prefers the backend-resolved stage cached by
  /// [applyStudentView] (the backend is the trusted source); falls back to the
  /// local grade so a first offline launch still lands in the right shell.
  LearningStage get stage =>
      LearningStage.fromWire(profile?['stage'] as String?) ?? stageForGrade(grade);

  /// Middle-school context lens ('market', 'building', …) — legacy, kept as
  /// a fallback flavor for profiles without [interests]. Null if unset.
  String? get learningContext => profile?['learningContext'] as String?;

  Future<void> setLearningContext(String? id) async {
    final p = Map<String, dynamic>.from(profile ?? {});
    if (id == null) {
      p.remove('learningContext');
    } else {
      p['learningContext'] = id;
    }
    await setProfile(p);
  }

  /// 'm' or 'f' or null — used ONLY for Arabic grammatical addressing.
  String? get gender => profile?['gender'] as String?;

  /// Personal interests (1-2, both stages) — the primary signal AI
  /// explanations, examples and activities draw from.
  List<String> get interests =>
      (profile?['interests'] as List?)?.cast<String>() ?? const [];

  /// True when the locally-saved interests haven't been confirmed by a
  /// successful `PATCH /students/me` yet (offline save, failed request, or
  /// not registered at save time). [InterestsSync] clears this once the
  /// server echoes the same interests back. Ask Hudhud only ever reasons
  /// from the server's copy (it reads the authenticated student row, never
  /// the request body), so while this is true the tutor is still using
  /// whatever interests it last confirmed — not this pending local pick.
  bool get interestsSyncPending => _prefs.getBool('interestsSyncPending') ?? false;

  /// Local-first write: the UI and Session.interests reflect the pick
  /// immediately (even offline), marked pending until the server confirms.
  Future<void> setInterests(List<String> ids) async {
    final p = Map<String, dynamic>.from(profile ?? {});
    p['interests'] = ids;
    await setProfile(p);
    await _prefs.setBool('interestsSyncPending', true);
  }

  /// Called only by [InterestsSync] after the server echoes back exactly
  /// the interests the client meant to save — clears the pending flag so a
  /// later profile refresh is free to sync interests from the server again.
  Future<void> confirmInterestsSynced(List<String> ids) async {
    final p = Map<String, dynamic>.from(profile ?? {});
    p['interests'] = ids;
    await setProfile(p);
    await _prefs.setBool('interestsSyncPending', false);
  }

  /// Merges the backend's trusted student view (GET/PATCH /students/me or the
  /// create response) into the cached profile: grade, resolved stage,
  /// learningContext, gender, and interests. Local cache stays for offline
  /// startup, but the server wins whenever it has spoken — EXCEPT interests
  /// while a local edit hasn't been confirmed yet ([interestsSyncPending]):
  /// a routine refresh (e.g. EduMindRoot's startup GET /students/me) must
  /// never silently clobber an unsynced local pick with the server's stale
  /// copy. [InterestsSync] is the only path that resolves that pending edit.
  Future<void> applyStudentView(Map<String, dynamic> student) async {
    final p = Map<String, dynamic>.from(profile ?? {});
    if (student['grade'] is num) p['grade'] = (student['grade'] as num).toInt();
    if (student['stage'] is String) p['stage'] = student['stage'];
    if (student['name'] is String) p['name'] = student['name'];
    if (student.containsKey('learningContext')) {
      final ctx = student['learningContext'];
      if (ctx == null) {
        p.remove('learningContext');
      } else {
        p['learningContext'] = ctx;
      }
    }
    if (student.containsKey('gender')) {
      final g = student['gender'];
      if (g == null) {
        p.remove('gender');
      } else {
        p['gender'] = g;
      }
    }
    if (student['interests'] is List && !interestsSyncPending) {
      p['interests'] = student['interests'];
    }
    await setProfile(p);
  }

  /// Active "Ask" tutor conversation — persisted so مساعدي restores its real
  /// backend thread across launches (never a local-only history).
  String? get tutorConversationId => _prefs.getString('tutorConversationId');

  Future<void> setTutorConversationId(String? id) async {
    if (id == null) {
      await _prefs.remove('tutorConversationId');
    } else {
      await _prefs.setString('tutorConversationId', id);
    }
  }

  /// Drops only the (now-invalid) device credentials — never the learner's
  /// local profile, learning progress, or completed lessons. Used when the
  /// backend rejects the saved token (e.g. the account no longer exists
  /// server-side): the learner goes through onboarding again to register a
  /// new device account, but nothing they already did on this device is
  /// deleted. [LearnProgressStore] lives under its own SharedPreferences
  /// keys and is never touched by either method here.
  Future<void> clearAuth() async {
    await _prefs.remove('token');
    await _prefs.remove('studentId');
  }

  Future<void> reset() async {
    await _prefs.remove('token');
    await _prefs.remove('studentId');
    await _prefs.remove('profile');
    await _prefs.remove('tutorConversationId');
  }
}
