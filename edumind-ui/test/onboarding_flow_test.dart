import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:edumind/app_localizations.dart';
import 'package:edumind/core/palette.dart';
import 'package:edumind/core/session.dart';
import 'package:edumind/core/stage.dart';
import 'package:edumind/features/onboarding/onboarding_flow.dart';
import 'package:edumind/features/onboarding/onboarding_widgets.dart';
import 'package:edumind/language_provider.dart';

/// Drives the 7-step onboarding end-to-end (offline) and checks that it
/// writes the REAL profile fields product routing and personalization
/// depend on: Session grade + stage (1-6 → primary_games, 7-9 → middle),
/// gender, and interests — the last two now collected identically for both
/// stages (replacing the old primary-only interests / middle-only lens
/// split).
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
    bool middle = false,
    String gender = 'Male',
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

    // 3 — gender (required before Next enables)
    await tester.tap(find.text(gender));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    // 4 — stage first, then only that stage's grades appear
    expect(find.text(gradeLabel), findsNothing);
    await tester.tap(find.text(stageLabel));
    await tester.pumpAndSettle();
    await tester.tap(find.text(gradeLabel));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    // 5 — interests: the SAME grid for both stages now, up to two picks.
    await tester.tap(find.text('Tech & robots'));
    await tester.tap(find.text('Nature & environment'));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    // 6 — accent color (default already selected — Next always enabled)
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    // 7 — starting preference (finish CTA)
    await tester.tap(find.text(middle ? 'From a real situation' : 'Let me try it myself'));
    await tester.pump();
    await tester.tap(find.text('Start my journey'));
    // completion beat (1.3s) + offline registration failing fast (swallowed);
    // the celebrating mascot animates forever, so timed pumps only
    await tester.pump(const Duration(seconds: 2));
    await tester.pump(const Duration(seconds: 2));
  }

  testWidgets('primary learner (grade 5) routes to primary_games, gender + interests saved',
      (tester) async {
    phoneSurface(tester);
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();
    var done = false;

    await tester.pumpWidget(app(() => done = true));
    await drive(tester, stageLabel: 'Primary', gradeLabel: 'Grade 5', gender: 'Female');

    expect(done, isTrue);
    expect(Session.instance.onboarded, isTrue);
    expect(Session.instance.name, 'Rami');
    expect(Session.instance.grade, 5);
    expect(Session.instance.stage, LearningStage.primaryGames);
    expect(Session.instance.profile!['gender'], 'f');
    expect(Session.instance.interests, ['tech_robotics', 'nature_environment']);
    // companion archetype derived from the first pick (primary stage only)
    expect(Session.instance.profile!['interest'], 'robots');
    // the lens step no longer exists in onboarding for any stage
    expect(Session.instance.learningContext, isNull);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets(
      'middle-school learner (grade 7) routes to middle_interactive_learning, '
      'same interests grid as primary', (tester) async {
    phoneSurface(tester);
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();
    var done = false;

    await tester.pumpWidget(app(() => done = true));
    await drive(
      tester,
      stageLabel: 'Middle school',
      gradeLabel: 'Grade 7',
      middle: true,
      gender: 'Male',
    );

    expect(done, isTrue);
    expect(Session.instance.grade, 7);
    expect(Session.instance.stage, LearningStage.middleInteractiveLearning);
    expect(Session.instance.profile!['gender'], 'm');
    // interests are collected for middle school too now (no more Lens step)
    expect(Session.instance.interests, ['tech_robotics', 'nature_environment']);
    // the companion-sprite archetype is a primary-stage-only concept
    expect(Session.instance.profile!.containsKey('interest'), isFalse);
    expect(Session.instance.learningContext, isNull);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('gender is required to advance past its step', (tester) async {
    phoneSurface(tester);
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();

    await tester.pumpWidget(app(() {}));
    await tester.pump();
    await tester.tap(find.text('Start'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.enterText(find.byType(TextField), 'Nour');
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    // still on the gender step — Next is disabled until a choice is made
    final next = tester.widget<OnbPrimaryButton>(find.byType(OnbPrimaryButton));
    expect(next.onPressed, isNull);
    expect(find.text('You are'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('interest cap: a third selection is ignored (both stages, same grid)', (tester) async {
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
    await tester.tap(find.text('Male'));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Primary'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Grade 3'));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Tech & robots'));
    await tester.tap(find.text('Drawing & design'));
    await tester.pump();
    await tester.tap(find.text('Sports & movement'));
    await tester.pump();
    // the counter shows only mid-selection; with two picked it is hidden
    final counterOpacity = tester.widget<AnimatedOpacity>(
      find.ancestor(of: find.text('2 of 2'), matching: find.byType(AnimatedOpacity)),
    );
    expect(counterOpacity.opacity, 0);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('gender choice survives back navigation', (tester) async {
    phoneSurface(tester);
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();

    await tester.pumpWidget(app(() {}));
    await tester.pump();
    await tester.tap(find.text('Start'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.enterText(find.byType(TextField), 'Sara');
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    // pick a gender, step back to name, then forward again — the pick must
    // still be there (OnboardingFlow._back never clears state).
    await tester.tap(find.text('Female'));
    await tester.pump();
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    final card = tester.widget<OnbSelectCard>(
      find.ancestor(of: find.text('Female'), matching: find.byType(OnbSelectCard)),
    );
    expect(card.selected, isTrue);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('accent color step shows exactly the four approved circles and updates the saved color',
      (tester) async {
    phoneSurface(tester);
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();
    var done = false;

    await tester.pumpWidget(app(() => done = true));
    await tester.pump();
    await tester.tap(find.text('Start'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.enterText(find.byType(TextField), 'Yara');
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Male'));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Primary'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Grade 4'));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tech & robots'));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    // exactly the four approved colors — circles only, semantic labels for a11y
    expect(find.bySemanticsLabel('Blue'), findsOneWidget);
    expect(find.bySemanticsLabel('Green'), findsOneWidget);
    expect(find.bySemanticsLabel('Pink'), findsOneWidget);
    expect(find.bySemanticsLabel('Black'), findsOneWidget);
    expect(find.text('Blue'), findsNothing); // circles only — no written color names
    expect(find.bySemanticsLabel('Teal'), findsNothing); // old palette is gone

    await tester.tap(find.bySemanticsLabel('Green'));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Let me try it myself'));
    await tester.pump();
    await tester.tap(find.text('Start my journey'));
    await tester.pump(const Duration(seconds: 2));
    await tester.pump(const Duration(seconds: 2));

    expect(done, isTrue);
    expect(Session.instance.profile!['color'], colorToHex(kColorChoices[0])); // green

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('the full flow is seven steps ("Step n of 7")', (tester) async {
    phoneSurface(tester);
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();

    await tester.pumpWidget(app(() {}));
    await tester.pump();
    await tester.tap(find.text('Start'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Step 2 of 7'), findsOneWidget); // the name step

    await tester.enterText(find.byType(TextField), 'Zaid');
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Step 3 of 7'), findsOneWidget); // the gender step

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('the outgoing createStudent request includes gender and interests', (tester) async {
    phoneSurface(tester);
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();
    var done = false;
    Map<String, dynamic>? sentBody;

    final mockClient = MockClient((req) async {
      if (req.method == 'POST' && req.url.path.endsWith('/api/v1/students')) {
        sentBody = jsonDecode(req.body) as Map<String, dynamic>;
        return http.Response(
          jsonEncode({
            'studentId': 'sid',
            'token': 'tok',
            'student': {'id': 'sid', 'grade': sentBody!['grade'], 'stage': 'primary_games'},
          }),
          201,
        );
      }
      return http.Response('not found', 404);
    });

    await http.runWithClient(() async {
      await tester.pumpWidget(app(() => done = true));
      await drive(tester, stageLabel: 'Primary', gradeLabel: 'Grade 6', gender: 'Male');
    }, () => mockClient);

    expect(done, isTrue);
    expect(sentBody, isNotNull);
    expect(sentBody!['gender'], 'm');
    expect(sentBody!['interests'], ['tech_robotics', 'nature_environment']);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });
}
