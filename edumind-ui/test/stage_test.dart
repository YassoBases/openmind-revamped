import 'package:edumind/core/stage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('stage resolver: grades 1-6 primary, 7-9 middle', () {
    for (final g in [1, 2, 3, 4, 5, 6]) {
      expect(stageForGrade(g), LearningStage.primaryGames, reason: 'grade $g');
    }
    for (final g in [7, 8, 9]) {
      expect(stageForGrade(g), LearningStage.middleInteractiveLearning, reason: 'grade $g');
    }
  });

  test('wire values round-trip and match the backend contract', () {
    expect(LearningStage.primaryGames.wire, 'primary_games');
    expect(LearningStage.middleInteractiveLearning.wire, 'middle_interactive_learning');
    for (final stage in LearningStage.values) {
      expect(LearningStage.fromWire(stage.wire), stage);
    }
    expect(LearningStage.fromWire('something_new'), isNull);
    expect(LearningStage.fromWire(null), isNull);
  });

  test('learning contexts match the backend list and are all supported', () {
    expect(
      kLearningContexts.map((c) => c.id).toList(),
      ['market', 'building', 'water_energy', 'roads_transport', 'technology'],
    );
    for (final c in kLearningContexts) {
      expect(isSupportedLearningContext(c.id), isTrue);
    }
    expect(isSupportedLearningContext('unicorns'), isFalse);
  });
}
