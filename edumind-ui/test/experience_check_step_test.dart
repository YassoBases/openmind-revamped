import 'package:edumind/app_localizations.dart';
import 'package:edumind/core/session.dart';
import 'package:edumind/features/learn/experience_screen.dart';
import 'package:edumind/features/learn/learn_models.dart';
import 'package:edumind/features/learn/learn_progress_store.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «تحقق من الفهم» with supportive retry: a wrong pick never freezes an item —
/// the tried option disables, the feedback guides without revealing, and the
/// learner keeps trying until the item is RESOLVED. The finish button waits
/// for every item to be resolved; the recorded score counts first-try
/// successes, and a weak one offers the tutor instead of blocking.
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
              'wrongFeedback': 'أعد عدّ المجموع على أصابعك.',
            },
            {
              'prompt': 'كم يساوي 3 × 3؟',
              'options': ['9', '6'],
              'correctIndex': 0,
              'correctFeedback': 'صحيح.',
              'wrongFeedback': 'الضرب تكرار للجمع: 3 + 3 + 3.',
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

  testWidgets('finish waits for every item to be resolved; a wrong pick retries',
      (tester) async {
    final exp = _checkOnlyExperience();
    await tester.pumpWidget(
        _app(ExperienceScreen(path: _path(exp), experience: exp)));
    await tester.pumpAndSettle();

    FilledButton finishButton() => tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'إنهاء'));

    expect(find.text('سؤال 1 من 2'), findsOneWidget);
    expect(finishButton().onPressed, isNull);

    // A wrong pick: guiding feedback appears (never the answer), the item
    // stays open — no «التالي», finish still waits.
    await tester.tap(find.text('5'));
    await tester.pump();
    expect(find.text('أعد عدّ المجموع على أصابعك.'), findsOneWidget);
    expect(find.text('جرّب إجابة أخرى — يمكنك الوصول إليها'), findsOneWidget);
    expect(find.text('التالي'), findsNothing);
    expect(finishButton().onPressed, isNull);

    // Retry with the right option resolves the item and unlocks «التالي».
    await tester.tap(find.text('4'));
    await tester.pump();
    await tester.tap(find.text('التالي'));
    await tester.pump();
    expect(find.text('سؤال 2 من 2'), findsOneWidget);
    await tester.tap(find.text('9'));
    await tester.pump();

    // All resolved: the score counts FIRST-TRY successes (1 of 2 — the
    // recovered item does not count), and exactly half is not a weak score.
    expect(find.text('أصبت 1 من 2 من المحاولة الأولى'), findsOneWidget);
    expect(find.text('راجع الفكرة مع مساعدك'), findsNothing);
    expect(finishButton().onPressed, isNotNull);

    // Finishing records completion and the first-try check score.
    await tester.tap(find.widgetWithText(FilledButton, 'إنهاء'));
    await tester.pumpAndSettle();
    final store = await LearnProgressStore.load();
    expect(store.isCompleted('test_path', 'exp_check'), isTrue);
    expect(store.checkResult('test_path', 'exp_check'), (1, 2));
  });

  testWidgets('a wrong pick never reveals the correct option', (tester) async {
    final exp = _checkOnlyExperience();
    await tester.pumpWidget(
        _app(ExperienceScreen(path: _path(exp), experience: exp)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('5'));
    await tester.pump();

    // The correct option carries no success mark until it is actually found.
    expect(find.byIcon(Icons.check_circle_rounded), findsNothing);
    // The tried option is marked and disabled; the learner must still choose.
    expect(find.byIcon(Icons.cancel_rounded), findsOneWidget);

    await tester.tap(find.text('4'));
    await tester.pump();
    expect(find.byIcon(Icons.check_circle_rounded), findsWidgets);
  });

  testWidgets('a weak first-try score (below half) offers the tutor',
      (tester) async {
    final exp = _checkOnlyExperience();
    await tester.pumpWidget(
        _app(ExperienceScreen(path: _path(exp), experience: exp)));
    await tester.pumpAndSettle();

    // Both items missed first, then recovered: first-try score is 0 of 2.
    await tester.tap(find.text('5'));
    await tester.pump();
    await tester.tap(find.text('4'));
    await tester.pump();
    await tester.tap(find.text('التالي'));
    await tester.pump();
    await tester.tap(find.text('6'));
    await tester.pump();
    await tester.tap(find.text('9'));
    await tester.pump();

    expect(find.text('أصبت 0 من 2 من المحاولة الأولى'), findsOneWidget);
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

    expect(find.text('أصبت 2 من 2 من المحاولة الأولى'), findsOneWidget);
    expect(find.text('راجع الفكرة مع مساعدك'), findsNothing);
  });
}
