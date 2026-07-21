/// Lesson Worlds — client models + pure stage-unlock rules.
///
/// A world is one school lesson turned into a planned sequence of short game
/// stages. The server owns the plan and per-stage generation; the client owns
/// the map, unlocking, and offline copies. All parsing is tolerant: a missing
/// field never crashes the map.
library;

/// One stage's map state: plan info + progress, straight from the API (or the
/// offline copy of it).
class WorldStage {
  WorldStage({
    required this.index,
    required this.status,
    this.error,
    this.stars,
    this.bestAccuracy,
    this.completedAt,
    this.focus,
    this.beat,
    this.gameType,
    this.variant,
    this.theme,
    this.kit,
    this.learningLevel,
    this.ramp,
  });

  final int index; // 1-based
  final String status; // planned | generating | ready | failed
  final String? error;
  final int? stars;
  final double? bestAccuracy;
  final DateTime? completedAt;
  final String? focus;
  final String? beat;
  final String? gameType;
  final String? variant;
  final String? theme;
  final String? kit;
  final String? learningLevel;
  final int? ramp;

  bool get completed => completedAt != null || (stars ?? 0) > 0;

  Map<String, dynamic> toMap() => {
        'index': index,
        'status': status,
        'error': error,
        'stars': stars,
        'bestAccuracy': bestAccuracy,
        'completedAt': completedAt?.toIso8601String(),
        'focus': focus,
        'beat': beat,
        'gameType': gameType,
        'variant': variant,
        'theme': theme,
        'kit': kit,
        'learningLevel': learningLevel,
        'ramp': ramp,
      };

  static WorldStage fromMap(Map<String, dynamic> m) => WorldStage(
        index: (m['index'] as num).toInt(),
        status: (m['status'] as String?) ?? 'planned',
        error: m['error'] as String?,
        stars: (m['stars'] as num?)?.toInt(),
        bestAccuracy: (m['bestAccuracy'] as num?)?.toDouble(),
        completedAt: m['completedAt'] == null
            ? null
            : DateTime.tryParse(m['completedAt'] as String),
        focus: m['focus'] as String?,
        beat: m['beat'] as String?,
        gameType: m['gameType'] as String?,
        variant: m['variant'] as String?,
        theme: m['theme'] as String?,
        kit: m['kit'] as String?,
        learningLevel: m['learningLevel'] as String?,
        ramp: (m['ramp'] as num?)?.toInt(),
      );
}

/// A world with its full map state.
class World {
  World({
    required this.id,
    required this.title,
    required this.subject,
    required this.topic,
    required this.language,
    required this.stageCount,
    required this.stages,
    this.lessonId,
    this.arcIntro,
    this.arcOutro,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  final String id;
  final String title;
  final String subject;
  final String topic;
  final String language;
  final int stageCount;
  final List<WorldStage> stages;
  final String? lessonId;
  final String? arcIntro;
  final String? arcOutro;
  final DateTime createdAt;

  int get completedCount => stages.where((s) => s.completed).length;
  bool get finished => stageCount > 0 && completedCount >= stageCount;

  Map<String, dynamic> toMap() => {
        'id': id,
        'title': title,
        'subject': subject,
        'topic': topic,
        'language': language,
        'stageCount': stageCount,
        'stages': stages.map((s) => s.toMap()).toList(),
        'lessonId': lessonId,
        'arcIntro': arcIntro,
        'arcOutro': arcOutro,
        'createdAt': createdAt.toIso8601String(),
      };

  static World fromMap(Map<String, dynamic> m) => World(
        id: m['id'] as String,
        title: (m['title'] as String?) ?? (m['topic'] as String?) ?? '',
        subject: (m['subject'] as String?) ?? '',
        topic: (m['topic'] as String?) ?? '',
        language: (m['language'] as String?) ?? 'en',
        stageCount: (m['stageCount'] as num?)?.toInt() ?? 0,
        stages: (m['stages'] is List ? m['stages'] as List : const [])
            .whereType<Map>()
            .map((s) => WorldStage.fromMap(s.cast<String, dynamic>()))
            .toList()
          ..sort((a, b) => a.index.compareTo(b.index)),
        lessonId: m['lessonId'] as String?,
        arcIntro: (m['arc'] is Map ? (m['arc'] as Map)['intro'] : m['arcIntro']) as String?,
        arcOutro: (m['arc'] is Map ? (m['arc'] as Map)['outro'] : m['arcOutro']) as String?,
        createdAt: DateTime.tryParse((m['createdAt'] as String?) ?? '') ?? DateTime.now(),
      );
}

/// How a stage node renders on the map.
enum StageNodeState { completed, current, locked }

/// Sequential unlocking, in plan order: stage 1 is always open, each next
/// stage opens when the previous one is completed. Exactly one uncompleted
/// open node exists at a time — the child's position. Pure and unit-testable.
List<StageNodeState> worldNodeStates(List<WorldStage> stages) {
  final states = <StageNodeState>[];
  var previousDone = true;
  var currentAssigned = false;
  for (final s in stages) {
    if (s.completed) {
      states.add(StageNodeState.completed);
    } else if (previousDone && !currentAssigned) {
      states.add(StageNodeState.current);
      currentAssigned = true;
    } else {
      states.add(StageNodeState.locked);
    }
    previousDone = s.completed;
  }
  return states;
}
