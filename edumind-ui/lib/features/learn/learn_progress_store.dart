import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';

/// A saved mid-experience position (step index the learner reached).
typedef LessonResume = ({String pathId, String experienceId, int step});

/// Completion state for learning experiences — local-first with backend sync.
///
/// SharedPreferences stays the instant, offline source of truth for the UI
/// (keys are "pathId/experienceId"). When the student is registered, every
/// completion is also PUT to /api/v1/learn/progress, and [syncWithBackend]
/// reconciles both directions (union merge — completion is monotonic), so
/// progress survives reinstalls, cleared storage, and other devices.
class LearnProgressStore {
  LearnProgressStore._(this._prefs);
  static LearnProgressStore? _instance;
  static const _key = 'learnCompleted';

  final SharedPreferences _prefs;

  /// Bumped whenever the completed set changes (a completion or a backend
  /// sync). Screens kept alive in the IndexedStack (journey map, Start, Me)
  /// listen to this instead of only reloading on their own navigation.
  static final ValueNotifier<int> revision = ValueNotifier(0);

  static Future<LearnProgressStore> load() async {
    _instance ??= LearnProgressStore._(await SharedPreferences.getInstance());
    return _instance!;
  }

  Set<String> get completed {
    final raw = _prefs.getString(_key);
    if (raw == null) return <String>{};
    return (jsonDecode(raw) as List).map((e) => e as String).toSet();
  }

  bool isCompleted(String pathId, String experienceId) =>
      completed.contains('$pathId/$experienceId');

  Future<void> _save(Set<String> set) =>
      _prefs.setString(_key, jsonEncode(set.toList()));

  Future<void> markCompleted(String pathId, String experienceId) async {
    await _save(completed..add('$pathId/$experienceId'));
    revision.value++;
    // Backend write is best-effort: offline completions are pushed by the
    // next syncWithBackend(); the local record above is never blocked.
    if (Session.instance.registered) {
      try {
        await Api.putLearnProgress(pathId, experienceId);
      } catch (_) {/* offline or server down — reconciled on next sync */}
    }
  }

  // ---- Resumable position -------------------------------------------------
  // One in-progress experience at most: the last one the learner left before
  // finishing, with the step they reached. This is what makes Home's
  // «تابع التجربة» honest — the label only appears when this state exists.
  static const _resumeKey = 'learnResume';

  LessonResume? get resume {
    final raw = _prefs.getString(_resumeKey);
    if (raw == null) return null;
    final m = jsonDecode(raw) as Map<String, dynamic>;
    final path = m['pathId'] as String?;
    final exp = m['experienceId'] as String?;
    final step = (m['step'] as num?)?.toInt() ?? 0;
    if (path == null || exp == null || step <= 0) return null;
    return (pathId: path, experienceId: exp, step: step);
  }

  /// Records that the learner reached [step] of an experience without
  /// finishing it. Step 0 is not worth resuming — it clears instead.
  Future<void> saveResume(String pathId, String experienceId, int step) async {
    if (step <= 0) return clearResume(pathId, experienceId);
    await _prefs.setString(_resumeKey,
        jsonEncode({'pathId': pathId, 'experienceId': experienceId, 'step': step}));
    revision.value++;
  }

  /// Drops the resume marker if it points at the given experience.
  Future<void> clearResume(String pathId, String experienceId) async {
    final r = resume;
    if (r == null || r.pathId != pathId || r.experienceId != experienceId) return;
    await _prefs.remove(_resumeKey);
    revision.value++;
  }

  /// Two-way reconcile: pull the server's completions into the local set and
  /// push any local-only ones up (both idempotent). Returns true when the
  /// local set changed, so callers know to refresh their UI.
  Future<bool> syncWithBackend() async {
    if (!Session.instance.registered) return false;
    try {
      final res = await Api.learnProgress();
      final remote = <String>{
        for (final item in (res['items'] as List? ?? const []))
          '${(item as Map)['pathId']}/${item['experienceId']}',
      };
      final local = completed;

      for (final key in local.difference(remote)) {
        final slash = key.indexOf('/');
        if (slash <= 0) continue;
        try {
          await Api.putLearnProgress(key.substring(0, slash), key.substring(slash + 1));
        } catch (_) {/* keep going — next sync retries */}
      }

      final merged = {...local, ...remote};
      if (merged.length == local.length) return false;
      await _save(merged);
      revision.value++;
      return true;
    } catch (_) {
      return false; // offline — local state stands
    }
  }
}
