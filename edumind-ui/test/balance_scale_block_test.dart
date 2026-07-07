import 'package:edumind/app_localizations.dart';
import 'package:edumind/features/tutor/blocks/balance_scale_block.dart';
import 'package:edumind/features/tutor/tutor_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

InteractivePayload _payload() => InteractivePayload.fromMap({
      'type': 'balance_scale',
      'version': 1,
      'title': 'وازن الميزان وأوجد المجهول',
      'instructions': 'حرّك x حتى يتساوى طرفا الميزان، ثم تحقق.',
      'data': {
        'coefficient': 1, 'constant': 3, 'target': 10, 'min': 0, 'max': 20, 'step': 1, 'tolerance': 0,
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
  // Payload starts at the midpoint x=10 (coefficient=1, constant=3, target=10
  // → the true solution is x=7), so every test must nudge before checking.

  testWidgets('balance_scale: reaching the solution reports correct', (tester) async {
    InteractiveResult? result;
    String? summary;
    await tester.pumpWidget(_app(BalanceScaleBlock(
      payload: _payload(),
      enabled: true,
      answered: false,
      onResult: (r, s) {
        result = r;
        summary = s;
      },
    )));
    await tester.pumpAndSettle();

    // Nudge from 10 down to 7 (x + 3 = 10).
    for (var i = 0; i < 3; i++) {
      await tester.tap(find.byTooltip('−'));
      await tester.pump();
    }
    await tester.tap(find.text('تحقق'));
    await tester.pump();

    expect(result, isNotNull);
    expect(result!.blockType, 'balance_scale');
    expect(result!.outcome, InteractiveOutcome.correct);
    expect(result!.answer, {'value': 7.0});
    expect(summary, contains('7'));

    // Locked after the one attempt — the frame confirms the send.
    expect(find.textContaining('أُرسلت نتيجتك'), findsOneWidget);
  });

  testWidgets('balance_scale: an unsolved position reports incorrect', (tester) async {
    InteractiveResult? result;
    await tester.pumpWidget(_app(BalanceScaleBlock(
      payload: _payload(),
      enabled: true,
      answered: false,
      onResult: (r, _) => result = r,
    )));
    await tester.pumpAndSettle();

    // Nudge once: x=9, 9+3=12 ≠ 10.
    await tester.tap(find.byTooltip('−'));
    await tester.pump();
    await tester.tap(find.text('تحقق'));
    await tester.pump();

    expect(result!.outcome, InteractiveOutcome.incorrect);
    expect(result!.answer, {'value': 9.0});
  });

  testWidgets('balance_scale: restored answered block renders frozen — no second attempt',
      (tester) async {
    var fired = false;
    await tester.pumpWidget(_app(BalanceScaleBlock(
      payload: _payload(),
      enabled: false,
      answered: true,
      onResult: (_, __) => fired = true,
    )));
    await tester.pumpAndSettle();
    expect(find.textContaining('أنجزت هذا النشاط'), findsOneWidget);
    expect(find.text('تحقق'), findsNothing);
    expect(fired, isFalse);
  });
}
