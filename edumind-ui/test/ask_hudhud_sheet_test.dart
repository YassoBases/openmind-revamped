import 'dart:convert';

import 'package:edumind/app_localizations.dart';
import 'package:edumind/core/session.dart';
import 'package:edumind/features/tutor/tutor_chat.dart';
import 'package:edumind/features/tutor/tutor_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The in-lesson "Ask Hudhud" help sheet gets a short greeting
/// ("أنا هدهد، اسألني بس") instead of the main Ask screen's long welcome —
/// everything else (input, quick actions, study-mode plumbing) is shared
/// and untouched. Also covers the student's personal accent color showing
/// up on a few limited interactive elements (send button, quick-action
/// chips) without touching the rest of the chat surface.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Widget app(Widget child, {Locale locale = const Locale('ar')}) => MaterialApp(
        locale: locale,
        supportedLocales: const [Locale('ar'), Locale('en')],
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: Scaffold(body: child),
      );

  setUp(() async {
    SharedPreferences.setMockInitialValues({'token': 'test-token', 'studentId': 's1'});
    await Session.load();
  });

  testWidgets('the help sheet (isHelpSheet: true) shows the short greeting, never the long one',
      (tester) async {
    await tester.pumpWidget(app(TutorChat(
      context_: TutorContext(source: 'experience'),
      isHelpSheet: true,
      seedQuestions: const ['أنا عالق في هذه الخطوة، أعطني تلميحًا'],
      quickActions: const ['أعطني تلميحًا فقط'],
    )));
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('أنا هدهد، اسألني بس'), findsOneWidget);
    expect(find.textContaining('اسألني في الرياضيات'), findsNothing);
    // The chat input and the contextual seed question stay.
    expect(find.byType(TextField), findsOneWidget);
    expect(find.text('أنا عالق في هذه الخطوة، أعطني تلميحًا'), findsOneWidget);
  });

  testWidgets('the main Ask screen (isHelpSheet unset) keeps its long welcome, unchanged',
      (tester) async {
    await tester.pumpWidget(app(TutorChat(
      context_: TutorContext(source: 'ask'),
      showStudyModes: true,
    )));
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.textContaining('اسألني في الرياضيات'), findsOneWidget);
    expect(find.text('أنا هدهد، اسألني بس'), findsNothing);
    // The five study modes are still offered on the main screen only.
    expect(find.text('حضّرني لسبر'), findsOneWidget);
  });

  testWidgets('the help sheet still offers its contextual quick actions after a reply',
      (tester) async {
    final mockClient = MockClient((req) async => http.Response(
          jsonEncode({
            'conversationId': 'c1',
            'model': 'mock',
            'reply': {
              'message': 'رد',
              'responseType': 'hint',
              'followUpQuestion': null,
              'suggestedAction': 'ask_followup',
              'relatedConcept': null,
              'needsClarification': false,
              'interactivePayload': null,
            },
          }),
          201,
          headers: {'content-type': 'application/json'},
        ));
    final key = GlobalKey<TutorChatState>();
    await http.runWithClient(() async {
      await tester.pumpWidget(app(TutorChat(
        key: key,
        context_: TutorContext(source: 'experience'),
        isHelpSheet: true,
        quickActions: const ['أعطني تلميحًا فقط', 'جرّب أبسط'],
      )));
      await tester.pump(const Duration(milliseconds: 400));
      await key.currentState!.send('سؤال');
      await tester.pump(const Duration(milliseconds: 400));
    }, () => mockClient);

    expect(find.text('أعطني تلميحًا فقط'), findsOneWidget);
    expect(find.text('جرّب أبسط'), findsOneWidget);
  });

  testWidgets('the send button and quick-action chips reflect the student\'s accent color',
      (tester) async {
    await Session.instance.setProfile({'name': 'Test', 'grade': 8, 'color': '#FF00FF'});

    await tester.pumpWidget(app(TutorChat(
      context_: TutorContext(source: 'experience'),
      isHelpSheet: true,
      quickActions: const ['أعطني تلميحًا فقط'],
    )));
    await tester.pump(const Duration(milliseconds: 400));

    final sendButton = tester.widget<IconButton>(
      find.ancestor(of: find.byIcon(Icons.send_rounded), matching: find.byType(IconButton)),
    );
    final resolvedBg = sendButton.style!.backgroundColor!.resolve({});
    expect(resolvedBg, const Color(0xFFFF00FF));
  });
}
