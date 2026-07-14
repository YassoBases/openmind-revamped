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

/// Study-mode picker on the main Ask Hudhud surface: five programs offered
/// BEFORE the conversation starts, one shared TutorChat underneath, and the
/// STABLE id — never the Arabic label — riding TutorContext.mode.

Widget _app(Widget child, {Locale locale = const Locale('ar')}) => MaterialApp(
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

Map<String, dynamic> _tutorReply(String message) => {
      'conversationId': 'conv-1',
      'model': 'mock',
      'reply': {
        'message': message,
        'responseType': 'question',
        'followUpQuestion': null,
        'suggestedAction': 'ask_followup',
        'relatedConcept': null,
        'needsClarification': true,
        'interactivePayload': null,
      },
    };

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({'token': 'test-token', 'studentId': 's1'});
    await Session.load();
  });

  testWidgets('the Ask surface offers all five programs before the conversation (Arabic)',
      (tester) async {
    await tester.pumpWidget(_app(TutorChat(
      context_: TutorContext(source: 'ask'),
      showStudyModes: true,
    )));
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('أو اختر برنامج دراسة'), findsOneWidget);
    expect(find.text('حضّرني لسبر'), findsOneWidget);
    expect(find.text('خلّيني أفهم درس'), findsOneWidget);
    expect(find.text('عندي تراكم'), findsOneWidget);
    expect(find.text('ساعدني أحل'), findsOneWidget);
    expect(find.text('راجع معي بسرعة'), findsOneWidget);
  });

  testWidgets('the five programs render English labels under the English locale',
      (tester) async {
    await tester.pumpWidget(_app(
      TutorChat(context_: TutorContext(source: 'ask'), showStudyModes: true),
      locale: const Locale('en'),
    ));
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Prep me for a quiz'), findsOneWidget);
    expect(find.text('Help me understand a lesson'), findsOneWidget);
    expect(find.text("I'm behind — help me catch up"), findsOneWidget);
    expect(find.text('Help me solve a problem'), findsOneWidget);
    expect(find.text('Quick review with me'), findsOneWidget);
  });

  testWidgets(
      'picking a program sends the STABLE id in context.mode with the label as the visible message',
      (tester) async {
    final requests = <Map<String, dynamic>>[];
    final mockClient = MockClient((req) async {
      requests.add(jsonDecode(req.body) as Map<String, dynamic>);
      return http.Response(
        jsonEncode(_tutorReply('ما المادة وما الموضوعات ومتى الموعد وكم الوقت المتاح؟')),
        201,
        headers: {'content-type': 'application/json'},
      );
    });

    final key = GlobalKey<TutorChatState>();
    await http.runWithClient(() async {
      await tester.pumpWidget(_app(TutorChat(
        key: key,
        context_: TutorContext(source: 'ask'),
        showStudyModes: true,
      )));
      await tester.pump(const Duration(milliseconds: 400));

      await tester.tap(find.text('حضّرني لسبر'));
      await tester.pump(const Duration(milliseconds: 400));
    }, () => mockClient);

    // Program logic is the id; the Arabic label is only the visible message.
    expect(requests, hasLength(1));
    expect(requests.first['question'], 'حضّرني لسبر');
    expect(requests.first['context']['mode'], 'exam_prep');
    expect(requests.first['context']['source'], 'ask');
    expect(key.currentState!.activeStudyMode, 'exam_prep');

    // The conversation started: student turn + the program's first step.
    expect(find.text('حضّرني لسبر'), findsWidgets); // now a chat bubble + chip
    expect(find.textContaining('ما المادة'), findsOneWidget);
  });

  testWidgets('every later message of the conversation keeps carrying the mode id',
      (tester) async {
    final requests = <Map<String, dynamic>>[];
    final mockClient = MockClient((req) async {
      requests.add(jsonDecode(req.body) as Map<String, dynamic>);
      return http.Response(
        jsonEncode(_tutorReply('تمام — التالي.')),
        201,
        headers: {'content-type': 'application/json'},
      );
    });

    final key = GlobalKey<TutorChatState>();
    await http.runWithClient(() async {
      await tester.pumpWidget(_app(TutorChat(
        key: key,
        context_: TutorContext(source: 'ask'),
        showStudyModes: true,
      )));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.text('عندي تراكم'));
      await tester.pump(const Duration(milliseconds: 400));

      await key.currentState!.send('رياضيات وعلوم، أسبوعان، ساعة يوميًا');
      await tester.pump(const Duration(milliseconds: 400));
    }, () => mockClient);

    expect(requests, hasLength(2));
    expect(requests[0]['context']['mode'], 'backlog_plan');
    expect(requests[1]['context']['mode'], 'backlog_plan');
    expect(requests[1]['conversationId'], 'conv-1'); // same thread, same chat system
  });

  testWidgets('the in-lesson help sheet keeps its contextual actions — no mode cards, no mode id',
      (tester) async {
    final requests = <Map<String, dynamic>>[];
    final mockClient = MockClient((req) async {
      requests.add(jsonDecode(req.body) as Map<String, dynamic>);
      return http.Response(
        jsonEncode(_tutorReply('تلميح صغير.')),
        201,
        headers: {'content-type': 'application/json'},
      );
    });

    final key = GlobalKey<TutorChatState>();
    await http.runWithClient(() async {
      await tester.pumpWidget(_app(TutorChat(
        key: key,
        context_: TutorContext(
          source: 'experience',
          subject: 'الاجتماعيات',
          concept: 'التسلسل الزمني',
        ),
        quickActions: const ['أعطني تلميحًا فقط'],
        // showStudyModes stays false: the sheet's contextual actions are
        // untouched by the study programs.
      )));
      await tester.pump(const Duration(milliseconds: 400));

      // No program cards on the in-lesson surface.
      expect(find.text('أو اختر برنامج دراسة'), findsNothing);
      expect(find.text('حضّرني لسبر'), findsNothing);

      await key.currentState!.send('أنا عالق في هذه الخطوة');
      await tester.pump(const Duration(milliseconds: 400));
    }, () => mockClient);

    // The contextual quick actions appear once the conversation exists.
    expect(find.text('أعطني تلميحًا فقط'), findsOneWidget);
    // The request kept the lesson context and carried NO mode.
    expect(requests.single['context']['source'], 'experience');
    expect(requests.single['context']['subject'], 'الاجتماعيات');
    expect(requests.single['context'].containsKey('mode'), isFalse);
  });

  testWidgets('a new conversation leaves the program and offers the picker again',
      (tester) async {
    final mockClient = MockClient((req) async => http.Response(
          jsonEncode(_tutorReply('لنبدأ.')),
          201,
          headers: {'content-type': 'application/json'},
        ));

    final key = GlobalKey<TutorChatState>();
    await http.runWithClient(() async {
      await tester.pumpWidget(_app(TutorChat(
        key: key,
        context_: TutorContext(source: 'ask'),
        showStudyModes: true,
      )));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.text('ساعدني أحل'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(key.currentState!.activeStudyMode, 'solve_diagnose');

      await key.currentState!.clearConversation();
      await tester.pump(const Duration(milliseconds: 400));
    }, () => mockClient);

    expect(key.currentState!.activeStudyMode, isNull);
    expect(find.text('أو اختر برنامج دراسة'), findsOneWidget);
  });
}
