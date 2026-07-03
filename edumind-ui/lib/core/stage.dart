/// The stage-based product rule — Dart twin of backend/src/learning/stage.ts.
///
/// One OpenMind app, two stage-appropriate learning experiences:
///  - grades 1-6  → [LearningStage.primaryGames] (the elementary games product)
///  - grades 7-9  → [LearningStage.middleInteractiveLearning] (journeys/tutor)
///
/// Every screen, route, or service that adapts to the learner's stage resolves
/// it HERE (usually via [Session.stage]) — never with its own grade math.
/// The backend remains the trusted source: the resolved `stage` string it
/// returns on the student view is cached in the profile and preferred over
/// the local grade fallback.
library;

enum LearningStage {
  primaryGames,
  middleInteractiveLearning;

  /// Wire value — matches the backend's LEARNING_STAGES exactly.
  String get wire => switch (this) {
        LearningStage.primaryGames => 'primary_games',
        LearningStage.middleInteractiveLearning => 'middle_interactive_learning',
      };

  static LearningStage? fromWire(String? v) => switch (v) {
        'primary_games' => LearningStage.primaryGames,
        'middle_interactive_learning' => LearningStage.middleInteractiveLearning,
        _ => null,
      };
}

const int kMinGrade = 1;
const int kMaxGrade = 9;

/// Last grade of the elementary games product.
const int kPrimaryMaxGrade = 6;

/// Grades 1-6 → primary games; 7-9 → middle-school interactive learning.
/// Offline fallback only — the backend-resolved stage wins when cached.
LearningStage stageForGrade(int grade) => grade <= kPrimaryMaxGrade
    ? LearningStage.primaryGames
    : LearningStage.middleInteractiveLearning;

/// Middle-school context lenses — ids match the backend's LEARNING_CONTEXTS.
/// A lens flavors story framing and examples; it never changes the concept,
/// difficulty, targets, or progress. Labels live in AppLocalizations
/// (`ctx_<id>`); emoji here so data and UI stay in one place.
const List<({String id, String emoji})> kLearningContexts = [
  (id: 'market', emoji: '🛒'),
  (id: 'building', emoji: '🏗️'),
  (id: 'water_energy', emoji: '💧'),
  (id: 'roads_transport', emoji: '🚌'),
  (id: 'technology', emoji: '📱'),
];

bool isSupportedLearningContext(String id) =>
    kLearningContexts.any((c) => c.id == id);
