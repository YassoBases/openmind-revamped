import 'package:edumind/features/tutor/tutor_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses the backend tutor contract', () {
    final result = TutorAskResult.fromMap({
      'conversationId': 'c-123',
      'reply': {
        'message': 'انظر إلى الشكل: ماذا يحدث للمساحة عندما تغيّر القاعدة؟',
        'responseType': 'hint',
        'followUpQuestion': 'أي بُعد ستغيّر أولًا؟',
        'suggestedAction': 'try_again',
        'relatedConcept': 'مساحة المثلث',
        'needsClarification': false,
      },
      'model': 'mock',
    });

    expect(result.conversationId, 'c-123');
    expect(result.reply.responseType, TutorResponseType.hint);
    expect(result.reply.suggestedAction, TutorSuggestedAction.tryAgain);
    expect(result.reply.followUpQuestion, isNotEmpty);
    expect(result.reply.relatedConcept, 'مساحة المثلث');
    expect(result.reply.needsClarification, isFalse);
  });

  test('degrades gracefully on unknown enum values and missing optionals', () {
    final reply = TutorReply.fromMap({
      'message': 'مرحبًا',
      'responseType': 'brand_new_type',
      'followUpQuestion': null,
      'suggestedAction': 'brand_new_action',
      'relatedConcept': null,
      'needsClarification': true,
    });
    expect(reply.responseType, TutorResponseType.unknown);
    expect(reply.suggestedAction, TutorSuggestedAction.unknown);
    expect(reply.followUpQuestion, isNull);
    expect(reply.needsClarification, isTrue);
  });

  test('TutorContext serializes only what it knows', () {
    final ask = TutorContext(source: 'ask').toMap();
    expect(ask, {'source': 'ask'});

    final exp = TutorContext(
      source: 'experience',
      subject: 'الرياضيات',
      pathId: 'neighborhood_engineer',
      experienceId: 'triangle_garden',
      stepKind: 'challenge',
      state: 'base=4, height=4, area=8, target=24',
      attempts: const ['القاعدة=5، الارتفاع=5'],
    ).toMap();
    expect(exp['source'], 'experience');
    expect(exp['state'], contains('target=24'));
    expect(exp['attempts'], hasLength(1));
    expect(exp.containsKey('pathTitle'), isFalse);
  });
}
