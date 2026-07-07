import 'package:edumind/app_localizations.dart';
import 'package:edumind/features/tutor/blocks/timeline_block.dart';
import 'package:edumind/features/tutor/tutor_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

InteractivePayload _payload() => InteractivePayload.fromMap({
      'type': 'timeline',
      'version': 1,
      'title': 'رتّب طريق الاستقلال',
      'instructions': 'المس الأحداث بترتيبها الزمني الصحيح.',
      'data': {
        'items': [
          {'id': 'ottoman_end', 'label': '١٩١٨ – نهاية الحكم العثماني'},
          {'id': 'mandate', 'label': '١٩٢٠ – بدء الانتداب الفرنسي'},
          {'id': 'revolt', 'label': '١٩٢٥ – الثورة السورية الكبرى'},
          {'id': 'independence', 'label': '١٩٤٦ – عيد الجلاء'},
        ],
        'correctOrder': ['ottoman_end', 'mandate', 'revolt', 'independence'],
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
  testWidgets('timeline: tapping events in the correct order reports correct', (tester) async {
    InteractiveResult? result;
    String? summary;
    await tester.pumpWidget(_app(TimelineBlock(
      payload: _payload(),
      enabled: true,
      answered: false,
      onResult: (r, s) {
        result = r;
        summary = s;
      },
    )));
    await tester.pumpAndSettle();

    for (final label in ['١٩١٨ – نهاية الحكم العثماني', '١٩٢٠ – بدء الانتداب الفرنسي',
        '١٩٢٥ – الثورة السورية الكبرى', '١٩٤٦ – عيد الجلاء']) {
      await tester.tap(find.text(label));
      await tester.pump();
    }
    await tester.tap(find.text('تحقق'));
    await tester.pump();

    expect(result, isNotNull);
    expect(result!.blockType, 'timeline');
    expect(result!.outcome, InteractiveOutcome.correct);
    expect(result!.answer, {
      'order': ['ottoman_end', 'mandate', 'revolt', 'independence'],
    });
    expect(summary, contains('١٩١٨'));
    expect(find.textContaining('أُرسلت نتيجتك'), findsOneWidget);
  });

  testWidgets('timeline: a shuffled order reports partially_correct', (tester) async {
    InteractiveResult? result;
    await tester.pumpWidget(_app(TimelineBlock(
      payload: _payload(),
      enabled: true,
      answered: false,
      onResult: (r, _) => result = r,
    )));
    await tester.pumpAndSettle();

    // Swap the middle two events: ottoman_end, revolt, mandate, independence.
    for (final label in ['١٩١٨ – نهاية الحكم العثماني', '١٩٢٥ – الثورة السورية الكبرى',
        '١٩٢٠ – بدء الانتداب الفرنسي', '١٩٤٦ – عيد الجلاء']) {
      await tester.tap(find.text(label));
      await tester.pump();
    }
    await tester.tap(find.text('تحقق'));
    await tester.pump();

    expect(result!.outcome, InteractiveOutcome.partiallyCorrect);
    expect(result!.answer, {
      'order': ['ottoman_end', 'revolt', 'mandate', 'independence'],
    });
  });

  testWidgets('timeline: tapping a placed event removes it for re-placement', (tester) async {
    await tester.pumpWidget(_app(TimelineBlock(
      payload: _payload(),
      enabled: true,
      answered: false,
      onResult: (_, __) {},
    )));
    await tester.pumpAndSettle();

    await tester.tap(find.text('١٩١٨ – نهاية الحكم العثماني'));
    await tester.pump();
    // Placed once — tap it again (now in the timeline) to take it back.
    await tester.tap(find.text('١٩١٨ – نهاية الحكم العثماني'));
    await tester.pump();
    // Check button must still be disabled (nothing placed).
    final checkButton = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(checkButton.onPressed, isNull);
  });

  testWidgets('timeline: restored answered block renders frozen — no second attempt',
      (tester) async {
    var fired = false;
    await tester.pumpWidget(_app(TimelineBlock(
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
