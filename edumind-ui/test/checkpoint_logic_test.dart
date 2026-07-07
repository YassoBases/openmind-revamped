import 'package:flutter_test/flutter_test.dart';
import 'package:edumind/features/learn/checkpoint_logic.dart';
import 'package:edumind/features/learn/learn_models.dart';
import 'package:edumind/features/learn/readiness_logic.dart';

// A tiny catalog: one path with an authored check item for eq.a, a drill on
// both skills, and a checkpoint over both.
LearnCatalog catalog() => LearnCatalog.fromMap({
      'language': 'ar',
      'subject': 'الرياضيات',
      'grade': 7,
      'skills': [
        {
          'id': 'eq.a',
          'title': 'A',
          'conceptFamily': 'linear_equations',
          'prereqs': <String>[],
          'drill': {
            'type': 'balance_scale',
            'paramRanges': {'coefficient': [1, 1], 'constant': [2, 9], 'solution': [2, 10]},
            'fixed': {'min': 0, 'max': 20, 'step': 1},
          },
        },
        {
          'id': 'eq.b',
          'title': 'B',
          'conceptFamily': 'linear_equations',
          'prereqs': ['eq.a'],
          'drill': {
            'type': 'balance_scale',
            'paramRanges': {'coefficient': [2, 4], 'constant': [1, 6], 'solution': [2, 6]},
            'fixed': {'min': 0, 'max': 30, 'step': 1},
          },
        },
      ],
      'paths': [
        {
          'id': 'p1',
          'title': 'P1',
          'tagline': 't',
          'experiences': [
            {
              'id': 'e1',
              'title': 'E1',
              'status': 'ready',
              'steps': [
                {
                  'kind': 'check',
                  'title': 'c',
                  'body': 'b',
                  'checkItems': [
                    {
                      'prompt': 'x + 5 = 12؟',
                      'options': ['7', '17', '5', '2'],
                      'correctIndex': 0,
                      'skills': ['eq.a'],
                    },
                  ],
                },
              ],
            },
          ],
          'checkpoints': [
            {'id': 'cp1', 'afterExperience': 'e1', 'skills': ['eq.a', 'eq.b']},
          ],
        },
      ],
    });

LearnPath path() => catalog().paths.single;

EvidenceEvent ev(String skill, String outcome) => EvidenceEvent(
      id: newEvidenceId(),
      skillId: skill,
      representation: 'manipulative',
      source: 'learn_step',
      kind: 'construction',
      outcome: outcome,
      verification: 'server_verified',
      createdAt: DateTime.now(),
    );

void main() {
  test('checkpointAfter finds the checkpoint gated on an experience', () {
    expect(checkpointAfter(path(), 'e1')?.id, 'cp1');
    expect(checkpointAfter(path(), 'nope'), isNull);
  });

  test('moveFor maps readiness to the three moves', () {
    expect(moveFor(ReadinessLevel.unseen), CheckpointMove.drill);
    expect(moveFor(ReadinessLevel.emerging), CheckpointMove.drill);
    expect(moveFor(ReadinessLevel.developing), CheckpointMove.reuse);
    expect(moveFor(ReadinessLevel.secure), CheckpointMove.transfer);
  });

  test('a drawn balance_scale drill is always valid and integer-solvable', () {
    final cp = path().checkpoints.single;
    // All-unseen readiness → every skill becomes a drill.
    for (var seed = 1; seed < 40; seed++) {
      final exp = buildCheckpointExperience(cp, catalog(), path(), const {}, seed: seed);
      final drills = exp.steps.where((s) => s.widget?.type == 'balance_scale');
      expect(drills, isNotEmpty);
      for (final step in drills) {
        final p = step.widget!.params;
        final a = (p['coefficient'] as num), b = (p['constant'] as num);
        final target = (p['target'] as num), min = (p['min'] as num), max = (p['max'] as num);
        final solution = (target - b) / a;
        expect(solution, solution.roundToDouble(), reason: 'integer solution');
        expect(solution >= min && solution <= max, isTrue, reason: 'solvable in range');
      }
    }
  });

  test('the synthetic experience is a ready experience the runner can play', () {
    final exp = buildCheckpointExperience(path().checkpoints.single, catalog(), path(), const {});
    expect(exp.ready, isTrue);
    expect(exp.id, 'cp1');
    expect(exp.steps.first.kind, LearnStepKind.scene); // intro
    // One task per checkpoint skill, plus the intro scene.
    expect(exp.steps.length, greaterThanOrEqualTo(3));
  });

  test('a developing skill reuses an authored item instead of a drill', () {
    // eq.a developing (one correct, no drill needed); it has an authored check
    // item → reuse. eq.b unseen → drill.
    final readiness = deriveSkillReadiness([ev('eq.a', 'correct')]);
    final exp = buildCheckpointExperience(
      path().checkpoints.single,
      catalog(),
      path(),
      readiness,
    );
    final reused = exp.steps.where((s) => s.kind == LearnStepKind.check);
    expect(reused, isNotEmpty); // eq.a came back as its authored item
    final drills = exp.steps.where((s) => s.widget?.type == 'balance_scale');
    expect(drills.length, 1); // only eq.b drilled
  });
}
