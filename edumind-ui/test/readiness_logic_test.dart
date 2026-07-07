import 'package:flutter_test/flutter_test.dart';
import 'package:edumind/features/learn/readiness_logic.dart';
import 'package:edumind/features/learn/journey_logic.dart';
import 'package:edumind/features/learn/learn_models.dart';

EvidenceEvent ev({
  String skill = 's1',
  String rep = 'manipulative',
  String? ctx,
  String kind = 'prediction',
  String outcome = 'correct',
  String verification = 'server_verified',
  int hints = 0,
  bool recovered = false,
  String? errorPattern,
  int? ms,
  DateTime? at,
}) =>
    EvidenceEvent(
      id: newEvidenceId(),
      skillId: skill,
      representation: rep,
      context: ctx,
      source: 'learn_step',
      kind: kind,
      outcome: outcome,
      verification: verification,
      hints: hints,
      recovered: recovered,
      errorPattern: errorPattern,
      ms: ms,
      createdAt: at ?? DateTime.now(),
    );

void main() {
  group('deriveReadiness', () {
    test('no events → unseen; a lone correct → not yet secure', () {
      expect(deriveReadiness(const []), isEmpty);
      final r = deriveReadiness([ev()]).values.single;
      expect(r.level, isNot(ReadinessLevel.secure)); // one answer is never mastery
      expect(r.score, 1.0);
    });

    test('three clean correct answers reach secure', () {
      final r = deriveReadiness([ev(), ev(), ev()]).values.single;
      expect(r.level, ReadinessLevel.secure);
    });

    test('all incorrect stays emerging with score 0', () {
      final r =
          deriveReadiness([ev(outcome: 'incorrect'), ev(outcome: 'incorrect')]).values.single;
      expect(r.level, ReadinessLevel.emerging);
      expect(r.score, 0.0);
    });

    test('a slow correct answer is still fully correct — ms never lowers score alone', () {
      final fast = deriveReadiness([ev(ms: 500)]).values.single;
      final slow = deriveReadiness([ev(ms: 90000)]).values.single;
      expect(slow.score, fast.score);
      expect(slow.score, 1.0);
    });

    test('a correct answer with hints counts less, but never negative', () {
      final unaided = deriveReadiness([ev()]).values.single.score;
      final hinted = deriveReadiness([ev(hints: 2)]).values.single.score;
      expect(hinted, lessThan(unaided));
      expect(hinted, greaterThan(0));
    });

    test('recovery after support is strong evidence (bonus over a bare hinted correct)', () {
      final hinted = deriveReadiness([ev(hints: 1)]).values.single.score;
      final recovered = deriveReadiness([ev(hints: 1, recovered: true)]).values.single.score;
      expect(recovered, greaterThan(hinted));
    });

    test('explored events count as participation, not accuracy', () {
      final r = deriveReadiness([ev(outcome: 'explored')]).values.single;
      expect(r.events, 1);
      expect(r.level, ReadinessLevel.emerging); // seen, but no committed accuracy
    });

    test('recentErrorPatterns surfaces newest-first, capped at 5', () {
      final now = DateTime.now();
      final events = [
        for (var i = 0; i < 7; i++)
          ev(
            outcome: 'incorrect',
            errorPattern: 'pattern_$i',
            at: now.add(Duration(minutes: i)),
          ),
      ];
      final r = deriveReadiness(events).values.single;
      expect(r.recentErrorPatterns.length, 5);
      expect(r.recentErrorPatterns.first, 'pattern_6'); // newest first
    });

    test('cells split by representation and context', () {
      final map = deriveReadiness([
        ev(rep: 'manipulative', ctx: 'market'),
        ev(rep: 'symbolic', ctx: 'market'),
        ev(rep: 'symbolic'),
      ]);
      expect(map.length, 3);
    });

    test('client_reported evidence is weighed below server_verified', () {
      // A server-verified incorrect + a client-reported correct: the trusted
      // miss should keep the score below a naive 50%.
      final r = deriveReadiness([
        ev(outcome: 'incorrect', verification: 'server_verified'),
        ev(outcome: 'correct', verification: 'client_reported'),
      ]).values.single;
      expect(r.score, lessThan(0.5));
    });

    test('EvidenceEvent survives a map round-trip', () {
      final e = ev(errorPattern: 'calculation_slip', ms: 1200, hints: 1);
      final back = EvidenceEvent.fromMap(e.toMap());
      expect(back, isNotNull);
      expect(back!.skillId, e.skillId);
      expect(back.errorPattern, 'calculation_slip');
      expect(back.ms, 1200);
      expect(back.verification, e.verification);
    });
  });

  group('nextGoal', () {
    LearnCatalog catalog() => LearnCatalog.fromMap({
          'language': 'ar',
          'subject': 'الرياضيات',
          'grade': 7,
          'skills': [
            {'id': 'a', 'title': 'A', 'conceptFamily': 'x', 'prereqs': <String>[]},
            {'id': 'b', 'title': 'B', 'conceptFamily': 'x', 'prereqs': ['a']},
          ],
          'paths': <dynamic>[],
        });

    LearnExperience experience() => LearnExperience.fromMap({
          'id': 'e1',
          'title': 'E1',
          'status': 'ready',
          'steps': [
            {'kind': 'explore', 'title': 't', 'body': 'b', 'skills': ['b']},
            {'kind': 'challenge', 'title': 't', 'body': 'b', 'skills': ['a']},
          ],
        });

    test('untagged experience → null', () {
      final exp = LearnExperience.fromMap({
        'id': 'e',
        'title': 'E',
        'status': 'ready',
        'steps': [
          {'kind': 'scene', 'title': 't', 'body': 'b'},
        ],
      });
      expect(nextGoal(exp, catalog(), const {}), isNull);
    });

    test('with no evidence, the first tagged (unseen) skill is the goal', () {
      // Both unseen; tie broken by first appearance ('b' appears first).
      final goal = nextGoal(experience(), catalog(), const {});
      expect(goal?.id, 'b');
    });

    test('grounds the goal in the weakest unmet prerequisite', () {
      // b is developing, but its prerequisite a is emerging (weaker) → surface a.
      final readiness = deriveSkillReadiness([
        ev(skill: 'b', outcome: 'correct'),
        ev(skill: 'a', outcome: 'incorrect'),
      ]);
      final goal = nextGoal(experience(), catalog(), readiness);
      expect(goal?.id, 'a');
    });
  });
}
