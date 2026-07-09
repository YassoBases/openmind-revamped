import 'package:edumind/app_localizations.dart';
import 'package:edumind/core/session.dart';
import 'package:edumind/features/learn/experience_screen.dart';
import 'package:edumind/features/learn/learn_models.dart';
import 'package:edumind/features/learn/learn_progress_store.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A scene step (auto, no hints) followed by a choice step with an authored
/// 3-level hint ladder — exercises both the ladder UI and the station's
/// star total shown at completion.
LearnExperience _experience() => LearnExperience.fromMap({
      'id': 'exp_hints',
      'title': 'تجربة التلميحات',
      'subtitle': '',
      'status': 'ready',
      'valueNote': 'هذه هي القيمة التي أضفتها.',
      'steps': [
        {'kind': 'scene', 'title': 'البداية', 'body': 'مشهد افتتاحي.'},
        {
          'kind': 'choice',
          'title': 'اختر',
          'body': '',
          'hints': ['ملاحظة أولى', 'الخطوة التالية', 'دعم أقوى'],
          'choice': {
            'prompt': 'كم يساوي 2 + 2؟',
            'options': ['4', '5'],
            'correctIndex': 0,
            'correctFeedback': 'صحيح.',
            'wrongFeedback': 'خطأ.',
          },
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

  testWidgets('hint ladder reveals one rung at a time, then hides its button',
      (tester) async {
    final exp = _experience();
    await tester.pumpWidget(_app(ExperienceScreen(path: _path(exp), experience: exp)));
    await tester.pumpAndSettle();

    // scene step first — no ladder to see yet.
    expect(find.text('تلميح'), findsNothing);
    await tester.tap(find.text('متابعة'));
    await tester.pump();

    // choice step: the ladder button starts as "تلميح" and no rung is open.
    expect(find.text('تلميح'), findsOneWidget);
    expect(find.text('ملاحظة أولى'), findsNothing);

    await tester.tap(find.text('تلميح'));
    await tester.pump();
    expect(find.text('ملاحظة أولى'), findsOneWidget);
    expect(find.text('تلميح آخر'), findsOneWidget);

    await tester.tap(find.text('تلميح آخر'));
    await tester.pump();
    expect(find.text('الخطوة التالية'), findsOneWidget);

    await tester.tap(find.text('تلميح آخر'));
    await tester.pump();
    expect(find.text('دعم أقوى'), findsOneWidget);
    // every rung open — the button goes away rather than offer a 4th.
    expect(find.text('تلميح آخر'), findsNothing);
  });

  testWidgets('stars total (discounted by hints used) and the value note show at completion',
      (tester) async {
    final exp = _experience();
    await tester.pumpWidget(_app(ExperienceScreen(path: _path(exp), experience: exp)));
    await tester.pumpAndSettle();

    // scene step: 1 participation star.
    await tester.tap(find.text('متابعة'));
    await tester.pump();

    // open all 3 hint rungs before answering — discounts this step to 1 star.
    await tester.tap(find.text('تلميح'));
    await tester.pump();
    await tester.tap(find.text('تلميح آخر'));
    await tester.pump();
    await tester.tap(find.text('تلميح آخر'));
    await tester.pump();

    await tester.tap(find.text('4'));
    await tester.pump();
    await tester.tap(find.text('إنهاء'));
    await tester.pumpAndSettle();

    // 1 (scene) + 1 (choice, floored after 3 hint rungs) = 2.
    expect(find.text('ربحت 2 نجوم في هذه المحطة'), findsOneWidget);
    expect(find.text('هذه هي القيمة التي أضفتها.'), findsOneWidget);
  });

  testWidgets('an unaided correct answer earns full marks for that step',
      (tester) async {
    final exp = _experience();
    await tester.pumpWidget(_app(ExperienceScreen(path: _path(exp), experience: exp)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('متابعة'));
    await tester.pump();
    await tester.tap(find.text('4')); // correct, no hints opened
    await tester.pump();
    await tester.tap(find.text('إنهاء'));
    await tester.pumpAndSettle();

    // 1 (scene) + 3 (choice, unaided) = 4.
    expect(find.text('ربحت 4 نجوم في هذه المحطة'), findsOneWidget);
  });
}
