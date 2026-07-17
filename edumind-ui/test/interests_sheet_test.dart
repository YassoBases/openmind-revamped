import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:edumind/app_localizations.dart';
import 'package:edumind/core/session.dart';
import 'package:edumind/features/context/interests_sheet.dart';

/// The "edit interests later" bottom sheet (opened from me_screen.dart /
/// profile_screen.dart) — pre-selects the student's current interests, caps
/// new picks at two, and saves through Session (never forced, only opened
/// on request).
void main() {
  Widget app() => MaterialApp(
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('ar'), Locale('en')],
        locale: const Locale('en'),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showInterestsSheet(context),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      );

  void phoneSurface(WidgetTester tester) {
    tester.view.physicalSize = const Size(1200, 2700);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);
  }

  testWidgets('pre-selects current interests, caps new picks at two, saves via Session',
      (tester) async {
    phoneSurface(tester);
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();
    await Session.instance.setInterests(['tech_robotics']);

    await tester.pumpWidget(app());
    await tester.pump(); // async localization delegate load
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    // pre-selected from the current Session state
    expect(find.byIcon(Icons.check_circle_rounded), findsOneWidget);

    // add a second interest, then a third is ignored (cap at 2) — the sheet
    // is scrollable, so bring each option into view before tapping it.
    await tester.ensureVisible(find.text('Nature & environment'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Nature & environment'));
    await tester.pump();
    await tester.ensureVisible(find.text('Drawing & design'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Drawing & design'));
    await tester.pump();
    expect(find.byIcon(Icons.check_circle_rounded), findsNWidgets(2));

    await tester.ensureVisible(find.text('Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(Session.instance.interests, ['tech_robotics', 'nature_environment']);
  });

  testWidgets('deselecting down to zero disables Save (at least one interest required)',
      (tester) async {
    phoneSurface(tester);
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();
    await Session.instance.setInterests(['helping_people']);

    await tester.pumpWidget(app());
    await tester.pump(); // async localization delegate load
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Helping people'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Helping people')); // deselect the only pick
    await tester.pump();

    final save = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Save'));
    expect(save.onPressed, isNull);
  });
}
