import 'package:edumind/app_localizations.dart';
import 'package:edumind/features/tutor/blocks/match_pairs_block.dart';
import 'package:edumind/features/tutor/tutor_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

InteractivePayload _payload() => InteractivePayload.fromMap({
      'type': 'match_pairs',
      'version': 1,
      'title': 'صِل الكلمة بمعناها',
      'instructions': 'المس الكلمة ثم المس معناها.',
      'data': {
        'pairs': [
          {'id': 'p1', 'left': 'rapid', 'right': 'سريع جدًا'},
          {'id': 'p2', 'left': 'ancient', 'right': 'قديم جدًا'},
          {'id': 'p3', 'left': 'assist', 'right': 'يساعد'},
        ],
      },
      'expectedLearningAction': '',
      'followUpPrompt': '',
    })!;

Widget _app(Widget child) => MaterialApp(
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  testWidgets('match_pairs: full tap flow reports the result once, with mistakes as signal',
      (tester) async {
    InteractiveResult? result;
    String? summary;
    await tester.pumpWidget(_app(MatchPairsBlock(
      payload: _payload(),
      enabled: true,
      answered: false,
      onResult: (r, s) {
        result = r;
        summary = s;
      },
    )));
    await tester.pumpAndSettle();

    // One deliberate mistake: rapid → قديم جدًا.
    await tester.tap(find.text('rapid'));
    await tester.pump();
    await tester.tap(find.text('قديم جدًا'));
    await tester.pump(const Duration(milliseconds: 700)); // red flash clears

    // Then everything correct (rapid stays selected for retry).
    await tester.tap(find.text('سريع جدًا'));
    await tester.pump();
    await tester.tap(find.text('ancient'));
    await tester.pump();
    await tester.tap(find.text('قديم جدًا'));
    await tester.pump();
    await tester.tap(find.text('assist'));
    await tester.pump();
    await tester.tap(find.text('يساعد'));
    await tester.pump();

    expect(result, isNotNull);
    expect(result!.blockType, 'match_pairs');
    expect(result!.outcome, InteractiveOutcome.partiallyCorrect);
    expect(result!.answer, {'wrongTries': 1}); // server recomputes from this
    expect(result!.learningSignal, contains('rapid'));
    expect(summary, contains('3'));

    // The frame confirms the result went to the tutor; no further taps land.
    await tester.pump();
    expect(find.textContaining('أُرسلت نتيجتك'), findsOneWidget);
  });

  testWidgets('match_pairs: clean run is correct with no learning signal', (tester) async {
    InteractiveResult? result;
    await tester.pumpWidget(_app(MatchPairsBlock(
      payload: _payload(),
      enabled: true,
      answered: false,
      onResult: (r, _) => result = r,
    )));
    await tester.pumpAndSettle();
    for (final pair in [
      ['rapid', 'سريع جدًا'],
      ['ancient', 'قديم جدًا'],
      ['assist', 'يساعد'],
    ]) {
      await tester.tap(find.text(pair[0]));
      await tester.pump();
      await tester.tap(find.text(pair[1]));
      await tester.pump();
    }
    expect(result!.outcome, InteractiveOutcome.correct);
    expect(result!.answer, {'wrongTries': 0});
    expect(result!.learningSignal, isNull);
  });

  testWidgets('match_pairs: restored answered block renders frozen — no second attempt',
      (tester) async {
    var fired = false;
    await tester.pumpWidget(_app(MatchPairsBlock(
      payload: _payload(),
      enabled: false,
      answered: true,
      onResult: (_, __) => fired = true,
    )));
    await tester.pumpAndSettle();
    // The quiet completed note, and no live manipulable buttons.
    expect(find.textContaining('أنجزت هذا النشاط'), findsOneWidget);
    expect(find.text('rapid'), findsNothing);
    expect(fired, isFalse);
  });
}
