// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:edumind/core/session.dart';
import 'package:edumind/language_provider.dart';
import 'package:edumind/main.dart';
import 'package:edumind/provider/theme_provider.dart';

void main() {
  testWidgets('App shows onboarding', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    await Session.load();

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => ThemeProvider()),
          ChangeNotifierProvider(create: (_) => LanguageProvider('en')),
        ],
        child: const TickerMode(enabled: false, child: EduMindApp()),
      ),
    );
    await tester.pump();

    expect(find.text('Welcome to OpenMind'), findsOneWidget);
    expect(find.text('Start'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });
}
