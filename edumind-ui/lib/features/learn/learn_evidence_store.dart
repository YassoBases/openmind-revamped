import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import 'readiness_logic.dart';

/// The learner's evidence log — local-first with backend sync, same doctrine
/// as [LearnProgressStore]: SharedPreferences is the instant offline source
/// of truth, every append is also POSTed best-effort when registered, and
/// [syncWithBackend] reconciles both directions. The log is append-only and
/// keyed by client-generated event ids, so the merge is a trivially
/// conflict-free union — the same monotonic property that makes completion
/// sync safe.
///
/// Readiness is never stored: consumers call [events] and derive it through
/// readiness_logic.dart, so a rule change re-reads the same log.
class LearnEvidenceStore {
  LearnEvidenceStore._(this._prefs);
  static LearnEvidenceStore? _instance;
  static const _key = 'learnEvidence';

  /// Local cap: old events beyond this are dropped oldest-first. Decay makes
  /// them near-weightless for readiness anyway, and the server keeps the
  /// full log for registered students.
  static const _maxEvents = 500;

  final SharedPreferences _prefs;

  /// Bumped on every append/sync so journey and checkpoint views can refresh
  /// live, exactly like LearnProgressStore.revision.
  static final ValueNotifier<int> revision = ValueNotifier(0);

  static Future<LearnEvidenceStore> load() async {
    _instance ??= LearnEvidenceStore._(await SharedPreferences.getInstance());
    return _instance!;
  }

  /// Tests re-seed SharedPreferences between cases; the singleton must not
  /// carry the previous seed's prefs.
  @visibleForTesting
  static void resetForTesting() => _instance = null;

  List<EvidenceEvent> get events {
    final raw = _prefs.getString(_key);
    if (raw == null) return const [];
    return [
      for (final m in jsonDecode(raw) as List)
        ...?_tryEvent((m as Map).cast<String, dynamic>()),
    ];
  }

  static List<EvidenceEvent>? _tryEvent(Map<String, dynamic> m) {
    final e = EvidenceEvent.fromMap(m);
    return e == null ? null : [e];
  }

  Future<void> _save(List<EvidenceEvent> list) => _prefs.setString(
      _key, jsonEncode([for (final e in list) e.toMap()]));

  Future<void> append(EvidenceEvent event) async {
    final list = [...events, event];
    list.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    if (list.length > _maxEvents) list.removeRange(0, list.length - _maxEvents);
    await _save(list);
    revision.value++;
    // Backend write is best-effort: offline events are pushed by the next
    // syncWithBackend(); the local record above is never blocked.
    if (Session.instance.registered) {
      try {
        await Api.postLearnEvidence([event.toMap()]);
      } catch (_) {/* offline or server down — reconciled on next sync */}
    }
  }

  /// Two-way reconcile: union merge by event id (append-only log). Pulls the
  /// server's events into the local log and pushes local-only ones up.
  /// Returns true when the local log changed.
  Future<bool> syncWithBackend() async {
    if (!Session.instance.registered) return false;
    try {
      final res = await Api.learnEvidence();
      final remote = <String, EvidenceEvent>{};
      for (final item in (res['items'] as List? ?? const [])) {
        final e = EvidenceEvent.fromMap((item as Map).cast<String, dynamic>());
        if (e != null) remote[e.id] = e;
      }
      final local = events;
      final localIds = {for (final e in local) e.id};

      final toPush = [for (final e in local) if (!remote.containsKey(e.id)) e];
      if (toPush.isNotEmpty) {
        try {
          await Api.postLearnEvidence([for (final e in toPush) e.toMap()]);
        } catch (_) {/* keep going — next sync retries */}
      }

      final incoming =
          [for (final e in remote.values) if (!localIds.contains(e.id)) e];
      if (incoming.isEmpty) return false;
      final merged = [...local, ...incoming]
        ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
      if (merged.length > _maxEvents) {
        merged.removeRange(0, merged.length - _maxEvents);
      }
      await _save(merged);
      revision.value++;
      return true;
    } catch (_) {
      return false; // offline — local state stands
    }
  }
}
