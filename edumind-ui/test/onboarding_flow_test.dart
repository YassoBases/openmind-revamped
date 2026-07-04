import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:edumind/app_localizations.dart';
import 'package:edumind/core/session.dart';
import 'package:edumind/core/stage.dart';
import 'package:edumind/features/onboarding/onboarding_flow.dart';
import 'package:edumind/language_provider.dart';

/// Drives the redesigned 5-step onboarding end-to-end (offline) and checks
/// that it writes the REAL profile fields product routing depends on:
/// Session grade + stage — grades 1-6 → primary_games, 7-9 → middle.
void main() {
  Widget app(void Function() onDone) => MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => LanguageProvider('en')),
        ],
        child: MaterialApp(
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [Locale('ar'), Locale('en')],
          locale: const Locale('en'),
          home: OnboardingFlow(onDone: onDone),
        ),
      );

  // Phone-shaped surface (logical 400x900) so every step fits untruncated.
  void phoneSurface(WidgetTester tester) {
    tester.view.physicalSize = const Size(1200, 2700);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);
  }

  Future<void> drive(
    WidgetTester tester, {
    required String stageLabel,
    required String gradeLabel,
  }) async {
    await tester.pump(); // async localization delegate load
    // 1 — welcome (mascot ticker runs here — timed pump, not pumpAndSettle)
    await tester.tap(find.text('Start'));
    await tester.pump(const Duration(milliseconds: 400));

    // 2 — name
    await tester.enterText(find.byType(TextField), 'Rami');
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    // 3 — stage first, then only that stage's grades appear
    expect(find.text(gradeLabel), findsNothing);
    await tester.tap(find.text(stageLabel));
    await tester.pumpAndSettle();
    await tester.tap(find.text(gradeLabel));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    // 4 — interests (max two)
    await tester.tap(find.text('Science & inventions'));
    await tester.tap(find.text('Nature & environment'));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    // 5 — starting preference + accent (default accent already selected)
    await tester.tap(find.text('Let me try it myself'));
    await tester.pump();
    await tester.tap(find.text('Start my journey'));
    // completion beat (1.3s) + offline registration failing fast (swallowed);
    // the celebrating mascot animates forever, so timed pumps only
    await tester.pump(const Duration(seconds: 2));
    await tester.pump(const Duration(seconds: 2));
  }

  testWidgets('primary learner (grade 5) routes to primary_games', (tester) async {
    phoneSurface(tester);
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();
    var done = false;

    await tester.pumpWidget(app(() => done = true));
    await drive(tester, stageLabel: 'Primary', gradeLabel: 'Grade 5');

    expect(done, isTrue);
    expect(Session.instance.onboarded, isTrue);
    expect(Session.instance.name, 'Rami');
    expect(Session.instance.grade, 5);
    expect(Session.instance.stage, LearningStage.primaryGames);
    expect(Session.instance.profile!['interest'], 'space');

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('middle-school learner (grade 7) routes to middle_interactive_learning',
      (tester) async {
    phoneSurface(tester);
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();
    var done = false;

    await tester.pumpWidget(app(() => done = true));
    await drive(tester, stageLabel: 'Middle school', gradeLabel: 'Grade 7');

    expect(done, isTrue);
    expect(Session.instance.grade, 7);
    expect(Session.instance.stage, LearningStage.middleInteractiveLearning);
    // archetypes are a primary-stage concept — never set for middle school
    expect(Session.instance.profile!.containsKey('interest'), isFalse);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('interest cap: a third selection is ignored', (tester) async {
    phoneSurface(tester);
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();

    await tester.pumpWidget(app(() {}));
    await tester.pump(); // async localization delegate load
    await tester.tap(find.text('Start'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.enterText(find.byType(TextField), 'Nour');
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Primary'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Grade 3'));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Science & inventions'));
    await tester.tap(find.text('Tech & future'));
    await tester.pump();
    await tester.tap(find.text('Sports & motion'));
    await tester.pump();
    // the counter shows only mid-selection; with two picked it is hidden
    final counterOpacity = tester.widget<AnimatedOpacity>(
      find.ancestor(of: find.text('2 of 2'), matching: find.byType(AnimatedOpacity)),
    );
    expect(counterOpacity.opacity, 0);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });
}
