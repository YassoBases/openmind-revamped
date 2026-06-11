import 'game_store_io.dart' if (dart.library.js_interop) 'game_store_web.dart' as impl;

/// A locally saved game: the GameSpec + library metadata. Replay is fully
/// offline — bundled shell + this spec, zero network, KBs not MBs.
class SavedGame {
  SavedGame({
    required this.id,
    required this.gameType,
    required this.theme,
    required this.subject,
    required this.topic,
    required this.language,
    required this.specJson,
    this.thumbnailUrl,
    this.bestScore = 0,
    this.playCount = 0,
    DateTime? lastPlayedAt,
    DateTime? savedAt,
    this.pendingSummaryJson,
  })  : lastPlayedAt = lastPlayedAt ?? DateTime.now(),
        savedAt = savedAt ?? DateTime.now();

  final String id;
  final String gameType;
  final String theme;
  final String subject;
  final String topic;
  final String language;
  final String specJson;
  final String? thumbnailUrl;
  int bestScore;
  int playCount;
  DateTime lastPlayedAt;
  final DateTime savedAt;
  /// reportSummary captured offline, waiting to sync to the server.
  String? pendingSummaryJson;

  Map<String, dynamic> toMap() => {
        'id': id,
        'gameType': gameType,
        'theme': theme,
        'subject': subject,
        'topic': topic,
        'language': language,
        'specJson': specJson,
        'thumbnailUrl': thumbnailUrl,
        'bestScore': bestScore,
        'playCount': playCount,
        'lastPlayedAt': lastPlayedAt.millisecondsSinceEpoch,
        'savedAt': savedAt.millisecondsSinceEpoch,
        'pendingSummaryJson': pendingSummaryJson,
      };

  static SavedGame fromMap(Map<String, dynamic> m) => SavedGame(
        id: m['id'] as String,
        gameType: m['gameType'] as String,
        theme: m['theme'] as String,
        subject: m['subject'] as String,
        topic: m['topic'] as String,
        language: m['language'] as String,
        specJson: m['specJson'] as String,
        thumbnailUrl: m['thumbnailUrl'] as String?,
        bestScore: (m['bestScore'] as num?)?.toInt() ?? 0,
        playCount: (m['playCount'] as num?)?.toInt() ?? 0,
        lastPlayedAt: DateTime.fromMillisecondsSinceEpoch((m['lastPlayedAt'] as num).toInt()),
        savedAt: DateTime.fromMillisecondsSinceEpoch((m['savedAt'] as num).toInt()),
        pendingSummaryJson: m['pendingSummaryJson'] as String?,
      );
}

/// Platform-conditional offline store: Drift/sqlite on Android & iOS,
/// IndexedDB (idb_shim) on web.
abstract class GameStore {
  static GameStore? _instance;
  static GameStore get instance => _instance ??= impl.createGameStore();

  Future<void> save(SavedGame game);
  Future<SavedGame?> get(String id);
  Future<List<SavedGame>> list();
  Future<void> delete(String id);
  Future<void> updateStats(String id, {int? bestScore, bool played = false, String? pendingSummaryJson});
  Future<List<SavedGame>> withPendingSummaries();
}
