import 'dart:convert';
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

  /// Middle-school context lens ('market', 'building', …) or null.
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

  /// Merges the backend's trusted student view (GET/PATCH /students/me or the
  /// create response) into the cached profile: grade, resolved stage, and
  /// learningContext. Local cache stays for offline startup, but the server
  /// wins whenever it has spoken.
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
    await setProfile(p);
  }

  Future<void> reset() async {
    await _prefs.remove('token');
    await _prefs.remove('studentId');
    await _prefs.remove('profile');
  }
}
