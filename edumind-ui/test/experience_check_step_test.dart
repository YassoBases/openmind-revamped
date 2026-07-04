import 'package:edumind/app_localizations.dart';
import 'package:edumind/core/session.dart';
import 'package:edumind/features/learn/experience_screen.dart';
import 'package:edumind/features/learn/learn_models.dart';
import 'package:edumind/features/learn/learn_progress_store.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «تحقق من الفهم» gating: the finish button waits for every item to be
/// answered — never for every item to be correct — and a weak score offers
/// the tutor instead of blocking.
LearnExperience _checkOnlyExperience() => LearnExperience.fromMap({
      'id': 'exp_check',
      'title': 'تجربة الاختبار',
      'subtitle': '',
      'status': 'ready',
      'steps': [
        {
          'kind': 'check',
          'title': 'تحقق من فهمك',
          'body': 'سؤالان سريعان.',
          'checkItems': [
            {
              'prompt': 'كم يساوي 2 + 2؟',
              'options': ['4', '5'],
              'correctIndex': 0,
              'correctFeedback': 'صحيح.',
              'wrongFeedback': 'الجواب 4.',
            },
            {
              'prompt': 'كم يساوي 3 × 3؟',
              'options': ['9', '6'],
              'correctIndex': 0,
              'correctFeedback': 'صحيح.',
              'wrongFeedback': 'الجواب 9.',
            },
          ],
        },
      ],
    });

LearnPath _path(LearnExperience e) => LearnPath.fromMap({
      'id': 'test_path',
      'title': 'مسار الاختبار',
      'tagline': 'للاختبار',
      'experiences': [],
    })
  ..experiences.add(e);

Widget _app(Widget child) => MaterialApp(
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: child,
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    LearnProgressStore.resetForTesting();
    SharedPreferences.setMockInitialValues({});
    await Session.load();
  });

  testWidgets('finish stays disabled until every check item is answered',
      (tester) async {
    final exp = _checkOnlyExperience();
    await tester.pumpWidget(
        _app(ExperienceScreen(path: _path(exp), experience: exp)));
    await tester.pumpAndSettle();

    FilledButton finishButton() => tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'إنهاء'));

    expect(find.text('سؤال 1 من 2'), findsOneWidget);
    expect(finishButton().onPressed, isNull);

    // Answer item 1 (wrong on purpose): feedback teaches, button still waits.
    await tester.tap(find.text('5'));
    await tester.pump();
    expect(find.text('الجواب 4.'), findsOneWidget);
    expect(finishButton().onPressed, isNull);

    // Advance to item 2 and answer it correctly.
    await tester.tap(find.text('التالي'));
    await tester.pump();
    expect(find.text('سؤال 2 من 2'), findsOneWidget);
    await tester.tap(find.text('9'));
    await tester.pump();

    // All answered: score summary appears and finishing is allowed even
    // with a wrong answer. Exactly half correct is not a weak score.
    expect(find.text('أجبت صحيحًا عن 1 من 2'), findsOneWidget);
    expect(find.text('راجع الفكرة مع مساعدك'), findsNothing);
    expect(finishButton().onPressed, isNotNull);

    // Finishing records completion and the check score.
    await tester.tap(find.widgetWithText(FilledButton, 'إنهاء'));
    await tester.pumpAndSettle();
    final store = await LearnProgressStore.load();
    expect(store.isCompleted('test_path', 'exp_check'), isTrue);
    expect(store.checkResult('test_path', 'exp_check'), (1, 2));
  });

  testWidgets('a weak score (below half) offers the tutor, never a block',
      (tester) async {
    final exp = _checkOnlyExperience();
    await tester.pumpWidget(
        _app(ExperienceScreen(path: _path(exp), experience: exp)));
    await tester.pumpAndSettle();

    // Both items wrong: 0 of 2.
    await tester.tap(find.text('5'));
    await tester.pump();
    await tester.tap(find.text('التالي'));
    await tester.pump();
    await tester.tap(find.text('6'));
    await tester.pump();

    expect(find.text('أجبت صحيحًا عن 0 من 2'), findsOneWidget);
    expect(find.text('راجع الفكرة مع مساعدك'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'إنهاء'))
          .onPressed,
      isNotNull,
      reason: 'the check records, it never gates',
    );
  });

  testWidgets('a strong score shows no tutor offer', (tester) async {
    final exp = _checkOnlyExperience();
    await tester.pumpWidget(
        _app(ExperienceScreen(path: _path(exp), experience: exp)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('4'));
    await tester.pump();
    await tester.tap(find.text('التالي'));
    await tester.pump();
    await tester.tap(find.text('9'));
    await tester.pump();

    expect(find.text('أجبت صحيحًا عن 2 من 2'), findsOneWidget);
    expect(find.text('راجع الفكرة مع مساعدك'), findsNothing);
  });
}
