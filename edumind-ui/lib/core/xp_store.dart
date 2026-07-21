/// Persistent XP + streak, local-first.
///
/// The backend already owns the XP ledger (XpEvent rows, awarded by the
/// session endpoints) and streaks; this store caches the last-known truth in
/// SharedPreferences so Home shows REAL persisted numbers offline, applies
/// optimistic local bumps when a session completes, and reconciles with
/// GET /students/me/stats whenever the network allows (server value wins —
/// it is the ledger).
///
/// Level curve: level n needs n*100 XP beyond level n-1 (level 2 at 100,
/// level 3 at 300, level 4 at 600…). Gentle early levels, honest later ones.
library;

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'session.dart';

class XpStore {
  XpStore._(this._prefs);

  static XpStore? _instance;
  static Future<XpStore> instance() async =>
      _instance ??= XpStore._(await SharedPreferences.getInstance());

  /// Test seam.
  @visibleForTesting
  static void reset([XpStore? replacement]) => _instance = replacement;

  final SharedPreferences _prefs;
  final ValueNotifier<int> revision = ValueNotifier(0);

  static const _xpKey = 'xp.total';
  static const _streakKey = 'xp.streak';

  int get xp => _prefs.getInt(_xpKey) ?? 0;
  int get streak => _prefs.getInt(_streakKey) ?? 0;

  /// Level from total XP on the n*100 triangular curve.
  int get level => levelFor(xp);

  static int levelFor(int xp) {
    var level = 1;
    var need = 100;
    var remaining = xp;
    while (remaining >= need) {
      remaining -= need;
      level++;
      need = level * 100;
    }
    return level;
  }

  /// (into, needed) progress within the current level, for the header ring.
  (int into, int needed) levelProgress() {
    var level = 1;
    var need = 100;
    var remaining = xp;
    while (remaining >= need) {
      remaining -= need;
      level++;
      need = level * 100;
    }
    return (remaining, need);
  }

  /// Optimistic bump when a session completes (server confirmation follows
  /// on the next [refresh]).
  Future<void> addLocal(int amount, {int? streakCount}) async {
    if (amount > 0) await _prefs.setInt(_xpKey, xp + amount);
    if (streakCount != null && streakCount > streak) {
      await _prefs.setInt(_streakKey, streakCount);
    }
    revision.value++;
  }

  /// Reconcile with the server ledger. Quietly a no-op offline.
  Future<void> refresh() async {
    if (!Session.instance.registered) return;
    try {
      final stats = await Api.get('/api/v1/students/me/stats') as Map<String, dynamic>;
      await _prefs.setInt(_xpKey, (stats['xp'] as num?)?.toInt() ?? xp);
      await _prefs.setInt(_streakKey, (stats['streakCount'] as num?)?.toInt() ?? streak);
      revision.value++;
    } catch (_) {/* offline — the local cache stands */}
  }
}
