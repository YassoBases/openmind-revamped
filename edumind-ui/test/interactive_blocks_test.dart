import 'dart:convert';
import 'dart:io';

import 'package:edumind/features/tutor/blocks/block_logic.dart';
import 'package:edumind/features/tutor/tutor_models.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _payload(String type, Map<String, dynamic> data) => {
      'type': type,
      'version': 1,
      'title': 'نشاط',
      'instructions': 'جرّب',
      'data': data,
      'expectedLearningAction': '',
      'followUpPrompt': '',
    };

void main() {
  group('InteractivePayload.fromMap (closed-world parsing)', () {
    test('parses a valid number_line', () {
      final p = InteractivePayload.fromMap(_payload('number_line', {
        'min': 0, 'max': 1, 'step': 0.05, 'target': 0.75, 'tolerance': 0.05,
        'unit': 'من 0 إلى 1',
      }));
      expect(p, isNotNull);
      expect(p!.type, 'number_line');
      expect(p.target, 0.75);
    });

    test('rejects unknown block types (older client honesty)', () {
      expect(InteractivePayload.fromMap(_payload('hologram_3d', {})), isNull);
    });

    test('rejects a different registry version', () {
      final m = _payload('number_line',
          {'min': 0, 'max': 1, 'step': 0.1, 'target': 0.5});
      m['version'] = 2;
      expect(InteractivePayload.fromMap(m), isNull);
    });

    test('rejects a number_line whose target is out of range', () {
      expect(
        InteractivePayload.fromMap(_payload('number_line',
            {'min': 0, 'max': 1, 'step': 0.1, 'target': 7})),
        isNull,
      );
    });

    test('parses order_sequence and rejects a broken correctOrder', () {
      final items = [
        {'id': 'a', 'label': 'أ'},
        {'id': 'b', 'label': 'ب'},
        {'id': 'c', 'label': 'ج'},
      ];
      expect(
        InteractivePayload.fromMap(_payload('order_sequence',
            {'items': items, 'correctOrder': ['a', 'b', 'c']})),
        isNotNull,
      );
      expect(
        InteractivePayload.fromMap(_payload('order_sequence',
            {'items': items, 'correctOrder': ['a', 'b', 'zzz']})),
        isNull,
      );
    });

    test('parses sort_buckets and rejects a dangling bucket reference', () {
      final buckets = [
        {'id': 'noun', 'label': 'اسم'},
        {'id': 'verb', 'label': 'فعل'},
      ];
      final good = [
        {'id': '1', 'label': 'ماء', 'bucketId': 'noun'},
        {'id': '2', 'label': 'كتب', 'bucketId': 'verb'},
        {'id': '3', 'label': 'سوق', 'bucketId': 'noun'},
      ];
      expect(
        InteractivePayload.fromMap(
            _payload('sort_buckets', {'items': good, 'buckets': buckets})),
        isNotNull,
      );
      final bad = [...good];
      bad[1] = {'id': '2', 'label': 'كتب', 'bucketId': 'nope'};
      expect(
        InteractivePayload.fromMap(
            _payload('sort_buckets', {'items': bad, 'buckets': buckets})),
        isNull,
      );
    });

    test('parses match_pairs and rejects ambiguous duplicate labels', () {
      final pairs = [
        {'id': 'p1', 'left': 'rapid', 'right': 'سريع'},
        {'id': 'p2', 'left': 'ancient', 'right': 'قديم'},
        {'id': 'p3', 'left': 'brief', 'right': 'قصير'},
      ];
      final p = InteractivePayload.fromMap(_payload('match_pairs', {'pairs': pairs}));
      expect(p, isNotNull);
      expect(p!.pairs.length, 3);
      expect(p.pairs.first.left, 'rapid');

      // A duplicate right label makes the match ambiguous → unrenderable.
      final dup = [...pairs];
      dup[2] = {'id': 'p3', 'left': 'brief', 'right': 'قديم'};
      expect(
        InteractivePayload.fromMap(_payload('match_pairs', {'pairs': dup})),
        isNull,
      );
      // Too few pairs → unrenderable.
      expect(
        InteractivePayload.fromMap(_payload('match_pairs', {'pairs': pairs.sublist(0, 2)})),
        isNull,
      );
    });

    test('parses balance_scale and rejects an unsolvable-in-range instance', () {
      final good = _payload('balance_scale', {
        'coefficient': 1, 'constant': 3, 'target': 10, 'min': 0, 'max': 20, 'step': 1,
      });
      final p = InteractivePayload.fromMap(good);
      expect(p, isNotNull);
      expect(p!.coefficient, 1);
      expect(p.constant, 3);

      // Solution (target-constant)/coefficient = 30, outside [0,20] → unrenderable.
      expect(
        InteractivePayload.fromMap(_payload('balance_scale', {
          'coefficient': 1, 'constant': 3, 'target': 40, 'min': 0, 'max': 20, 'step': 1,
        })),
        isNull,
      );
      // A zero coefficient is not a real unknown → unrenderable.
      expect(
        InteractivePayload.fromMap(_payload('balance_scale', {
          'coefficient': 0, 'constant': 3, 'target': 10, 'min': 0, 'max': 20, 'step': 1,
        })),
        isNull,
      );
    });

    test('parses timeline (shares order_sequence\'s renderable rule)', () {
      final items = [
        {'id': 'a', 'label': '١٩١٨'},
        {'id': 'b', 'label': '١٩٢٠'},
        {'id': 'c', 'label': '١٩٤٦'},
      ];
      final p = InteractivePayload.fromMap(_payload('timeline',
          {'items': items, 'correctOrder': ['a', 'b', 'c']}));
      expect(p, isNotNull);
      expect(p!.items.length, 3);
      expect(
        InteractivePayload.fromMap(_payload('timeline',
            {'items': items, 'correctOrder': ['a', 'b', 'zzz']})),
        isNull,
      );
    });

    test('every backend golden parses renderable (anti-drift fixture)', () {
      // Generated by `npm -w backend run export:goldens` from the TypeScript
      // tool registry — the two sides are pinned to the same examples.
      final fixture = jsonDecode(
        File('test/fixtures/tool_goldens.json').readAsStringSync(),
      ) as Map<String, dynamic>;
      final goldens = (fixture['goldens'] as List).cast<Map<String, dynamic>>();
      expect(goldens.length, greaterThanOrEqualTo(18));
      final tools = <String>{};
      for (final g in goldens) {
        final parsed = InteractivePayload.fromMap(g['payload']);
        expect(parsed, isNotNull,
            reason: 'golden ${g['tool']}/${g['concept']}/${g['language']} must render');
        tools.add(parsed!.type);
      }
      expect(
        tools,
        containsAll([
          'number_line', 'order_sequence', 'sort_buckets', 'match_pairs', 'balance_scale', 'timeline',
        ]),
      );
    });

    test('a reply with a malformed payload degrades to text-only', () {
      final reply = TutorReply.fromMap({
        'message': 'جرب هذا',
        'responseType': 'next_step',
        'followUpQuestion': null,
        'suggestedAction': 'try_again',
        'relatedConcept': null,
        'needsClarification': false,
        'interactivePayload': {'type': 'number_line', 'version': 1},
      });
      expect(reply.interactivePayload, isNull);
      expect(reply.message, 'جرب هذا');
    });
  });

  group('block outcome logic', () {
    test('number line honors tolerance (default half step)', () {
      expect(numberLineOutcome(value: 0.75, target: 0.75, step: 0.05),
          InteractiveOutcome.correct);
      expect(
          numberLineOutcome(value: 0.7, target: 0.75, step: 0.05, tolerance: 0.05),
          InteractiveOutcome.correct);
      expect(numberLineOutcome(value: 0.5, target: 0.75, step: 0.05),
          InteractiveOutcome.incorrect);
    });

    test('order outcome: correct / partial / incorrect', () {
      const correct = ['a', 'b', 'c', 'd'];
      expect(orderOutcome(['a', 'b', 'c', 'd'], correct), InteractiveOutcome.correct);
      expect(orderOutcome(['a', 'c', 'b', 'd'], correct),
          InteractiveOutcome.partiallyCorrect);
      expect(orderOutcome(['d', 'a', 'b', 'c'], correct), InteractiveOutcome.incorrect);
    });

    test('timeline reuses orderOutcome exactly (same permutation mechanic)', () {
      const correct = ['ottoman_end', 'mandate', 'revolt', 'independence'];
      expect(
        orderOutcome(['ottoman_end', 'mandate', 'revolt', 'independence'], correct),
        InteractiveOutcome.correct,
      );
      expect(
        orderOutcome(['ottoman_end', 'revolt', 'mandate', 'independence'], correct),
        InteractiveOutcome.partiallyCorrect,
      );
    });

    test('match outcome from the mistake count', () {
      expect(matchOutcome(0, 4), InteractiveOutcome.correct);
      expect(matchOutcome(2, 4), InteractiveOutcome.partiallyCorrect);
      expect(matchOutcome(4, 4), InteractiveOutcome.incorrect);
      expect(matchOutcome(7, 4), InteractiveOutcome.incorrect);
    });

    test('match display order is deterministic and never the identity', () {
      final a = matchDisplayOrder(4, 'p1|p2|p3|p4');
      final b = matchDisplayOrder(4, 'p1|p2|p3|p4');
      expect(a, b); // stable across rebuilds/restores
      expect(a.toSet(), {0, 1, 2, 3}); // a permutation
      for (var n = 2; n <= 6; n++) {
        for (final seed in ['a|b|c|d|e|f', 'r1|r2|r3|r4|r5|r6', 'x']) {
          final order = matchDisplayOrder(n, seed);
          expect(List.generate(n, (i) => i), isNot(equals(order)),
              reason: 'aligned columns would leak the answers (n=$n seed=$seed)');
        }
      }
    });

    test('balance outcome honors tolerance (default half step)', () {
      expect(
        balanceOutcome(value: 7, coefficient: 1, constant: 3, target: 10, step: 1),
        InteractiveOutcome.correct,
      );
      expect(
        balanceOutcome(value: 5.2, coefficient: 2, constant: -1, target: 9, step: 1),
        InteractiveOutcome.correct, // 2*5.2-1=9.4, within the default half-step tolerance
      );
      expect(
        balanceOutcome(value: 4, coefficient: 2, constant: -1, target: 9, step: 1),
        InteractiveOutcome.incorrect,
      );
    });

    test('sort outcome from the per-item score', () {
      expect(sortOutcome(6, 6), InteractiveOutcome.correct);
      expect(sortOutcome(4, 6), InteractiveOutcome.partiallyCorrect);
      expect(sortOutcome(0, 6), InteractiveOutcome.incorrect);
    });

    test('InteractiveResult serializes the wire contract incl. the verifiable answer', () {
      final r = InteractiveResult(
        blockType: 'order_sequence',
        attempted: true,
        answerOrState: 'ترتيبي: أ ← ب',
        outcome: InteractiveOutcome.partiallyCorrect,
        answer: {'order': ['a', 'b']},
        learningSignal: '2/4',
      );
      expect(r.toMap(), {
        'blockType': 'order_sequence',
        'attempted': true,
        'answerOrState': 'ترتيبي: أ ← ب',
        'correctnessOrOutcome': 'partially_correct',
        'answer': {'order': ['a', 'b']},
        'learningSignal': '2/4',
      });
    });

    test('formatNum trims float noise', () {
      expect(formatNum(0.75), '0.75');
      expect(formatNum(3.0), '3');
      expect(formatNum(0.7000000000000001), '0.7');
    });
  });
}
