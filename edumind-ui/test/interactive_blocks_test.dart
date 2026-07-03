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

    test('sort outcome from the per-item score', () {
      expect(sortOutcome(6, 6), InteractiveOutcome.correct);
      expect(sortOutcome(4, 6), InteractiveOutcome.partiallyCorrect);
      expect(sortOutcome(0, 6), InteractiveOutcome.incorrect);
    });

    test('InteractiveResult serializes the wire contract', () {
      final r = InteractiveResult(
        blockType: 'order_sequence',
        attempted: true,
        answerOrState: 'ترتيبي: أ ← ب',
        outcome: InteractiveOutcome.partiallyCorrect,
        learningSignal: '2/4',
      );
      expect(r.toMap(), {
        'blockType': 'order_sequence',
        'attempted': true,
        'answerOrState': 'ترتيبي: أ ← ب',
        'correctnessOrOutcome': 'partially_correct',
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
