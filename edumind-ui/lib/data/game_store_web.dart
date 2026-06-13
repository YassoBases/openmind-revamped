import 'package:idb_shim/idb_browser.dart';
import 'game_store.dart';

/// Web offline store: IndexedDB via idb_shim (the brief's "IndexedDB adapter").
class IdbGameStore implements GameStore {
  static const _dbName = 'edumind';
  static const _storeName = 'saved_games';
  Database? _db;

  Future<Database> _open() async {
    if (_db != null) return _db!;
    final factory = idbFactoryBrowser;
    _db = await factory.open(_dbName, version: 1, onUpgradeNeeded: (e) {
      final db = e.database;
      if (!db.objectStoreNames.contains(_storeName)) {
        db.createObjectStore(_storeName, keyPath: 'id');
      }
    });
    return _db!;
  }

  Future<T> _tx<T>(String mode, Future<T> Function(ObjectStore store) body) async {
    final db = await _open();
    final tx = db.transaction(_storeName, mode);
    final result = await body(tx.objectStore(_storeName));
    await tx.completed;
    return result;
  }

  Map<String, dynamic> _cast(Object? raw) =>
      (raw as Map).map((k, v) => MapEntry(k.toString(), v));

  @override
  Future<void> save(SavedGame game) =>
      _tx(idbModeReadWrite, (s) => s.put(game.toMap()));

  @override
  Future<SavedGame?> get(String id) => _tx(idbModeReadOnly, (s) async {
        final raw = await s.getObject(id);
        return raw == null ? null : SavedGame.fromMap(_cast(raw));
      });

  @override
  Future<List<SavedGame>> list() => _tx(idbModeReadOnly, (s) async {
        final raw = await s.getAll();
        final games = raw.map((r) => SavedGame.fromMap(_cast(r))).toList()
          ..sort((a, b) => b.lastPlayedAt.compareTo(a.lastPlayedAt));
        return games;
      });

  @override
  Future<void> delete(String id) => _tx(idbModeReadWrite, (s) => s.delete(id));

  @override
  Future<void> updateStats(String id,
      {int? bestScore, bool played = false, String? pendingSummaryJson}) async {
    final game = await get(id);
    if (game == null) return;
    if (bestScore != null && bestScore > game.bestScore) game.bestScore = bestScore;
    if (played) {
      game.playCount += 1;
      game.lastPlayedAt = DateTime.now();
    }
    game.pendingSummaryJson = pendingSummaryJson;
    await save(game);
  }

  @override
  Future<List<SavedGame>> withPendingSummaries() async =>
      (await list()).where((g) => g.pendingSummaryJson != null).toList();
}

GameStore createGameStore() => IdbGameStore();
