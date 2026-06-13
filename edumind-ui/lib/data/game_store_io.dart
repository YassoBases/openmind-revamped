import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'game_store.dart';

part 'game_store_io.g.dart';

@DataClassName('SavedGameRow')
class SavedGames extends Table {
  TextColumn get id => text()();
  TextColumn get gameType => text()();
  TextColumn get theme => text()();
  TextColumn get subject => text()();
  TextColumn get topic => text()();
  TextColumn get language => text()();
  TextColumn get specJson => text()();
  TextColumn get thumbnailUrl => text().nullable()();
  IntColumn get bestScore => integer().withDefault(const Constant(0))();
  IntColumn get playCount => integer().withDefault(const Constant(0))();
  IntColumn get lastPlayedAt => integer()();
  IntColumn get savedAt => integer()();
  TextColumn get pendingSummaryJson => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

@DriftDatabase(tables: [SavedGames])
class EduMindDb extends _$EduMindDb {
  EduMindDb() : super(driftDatabase(name: 'edumind'));

  @override
  int get schemaVersion => 1;
}

/// Native (Android/iOS) offline store: Drift + sqlite.
class DriftGameStore implements GameStore {
  DriftGameStore() : _db = EduMindDb();
  final EduMindDb _db;

  SavedGame _fromRow(SavedGameRow r) => SavedGame.fromMap({
        'id': r.id,
        'gameType': r.gameType,
        'theme': r.theme,
        'subject': r.subject,
        'topic': r.topic,
        'language': r.language,
        'specJson': r.specJson,
        'thumbnailUrl': r.thumbnailUrl,
        'bestScore': r.bestScore,
        'playCount': r.playCount,
        'lastPlayedAt': r.lastPlayedAt,
        'savedAt': r.savedAt,
        'pendingSummaryJson': r.pendingSummaryJson,
      });

  @override
  Future<void> save(SavedGame g) async {
    await _db.into(_db.savedGames).insertOnConflictUpdate(SavedGamesCompanion.insert(
          id: g.id,
          gameType: g.gameType,
          theme: g.theme,
          subject: g.subject,
          topic: g.topic,
          language: g.language,
          specJson: g.specJson,
          thumbnailUrl: Value(g.thumbnailUrl),
          bestScore: Value(g.bestScore),
          playCount: Value(g.playCount),
          lastPlayedAt: g.lastPlayedAt.millisecondsSinceEpoch,
          savedAt: g.savedAt.millisecondsSinceEpoch,
          pendingSummaryJson: Value(g.pendingSummaryJson),
        ));
  }

  @override
  Future<SavedGame?> get(String id) async {
    final row = await (_db.select(_db.savedGames)..where((t) => t.id.equals(id)))
        .getSingleOrNull();
    return row == null ? null : _fromRow(row);
  }

  @override
  Future<List<SavedGame>> list() async {
    final rows = await (_db.select(_db.savedGames)
          ..orderBy([(t) => OrderingTerm.desc(t.lastPlayedAt)]))
        .get();
    return rows.map(_fromRow).toList();
  }

  @override
  Future<void> delete(String id) async {
    await (_db.delete(_db.savedGames)..where((t) => t.id.equals(id))).go();
  }

  @override
  Future<void> updateStats(String id,
      {int? bestScore, bool played = false, String? pendingSummaryJson}) async {
    final existing = await get(id);
    if (existing == null) return;
    await (_db.update(_db.savedGames)..where((t) => t.id.equals(id)))
        .write(SavedGamesCompanion(
      bestScore: bestScore != null && bestScore > existing.bestScore
          ? Value(bestScore)
          : const Value.absent(),
      playCount: played ? Value(existing.playCount + 1) : const Value.absent(),
      lastPlayedAt:
          played ? Value(DateTime.now().millisecondsSinceEpoch) : const Value.absent(),
      pendingSummaryJson: Value(pendingSummaryJson),
    ));
  }

  @override
  Future<List<SavedGame>> withPendingSummaries() async {
    final rows = await (_db.select(_db.savedGames)
          ..where((t) => t.pendingSummaryJson.isNotNull()))
        .get();
    return rows.map(_fromRow).toList();
  }
}

GameStore createGameStore() => DriftGameStore();
