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

/// Retry/lifecycle honesty for Ask Hudhud:
///  - a block submission that never reached the server shows NO "sent" note
///    and re-opens for a genuine resubmit;
///  - a restored open block shows how many budgeted attempts are spent;
///  - a restored thread resumes its study program (chip + context.mode);
///  - a failed program-opening message rolls the program back;
///  - quick actions hide while a program runs; a program stays reachable
///    mid-conversation without discarding the thread.

Widget _app(Widget child) => MaterialApp(
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(body: child),
    );

Map<String, dynamic> _numberLinePayload() => {
      'type': 'number_line',
      'version': 1,
      'title': 'ضع الكسر ٣/٤',
      'instructions': 'حرّك المؤشر إلى ثلاثة أرباع',
      'data': {
        'min': 0, 'max': 1, 'step': 0.25, 'target': 0.75, 'tolerance': 0.05,
        'unit': null, 'items': null, 'correctOrder': null, 'buckets': null,
        'pairs': null, 'coefficient': null, 'constant': null, 'views': null,
      },
      'expectedLearningAction': 'وضع القيمة بنفسه',
      'followUpPrompt': 'ماذا لاحظت؟',
    };

Map<String, dynamic> _thread({String? mode, List<Map<String, dynamic>>? extra}) => {
      'conversationId': 'conv-9',
      'mode': mode,
      'messages': [
        {
          'id': 'm1', 'role': 'student', 'content': 'كيف أضع الكسر ٣/٤؟',
          'responseType': null, 'interactivePayload': null, 'interactiveResult': null,
          'createdAt': '2026-07-14T10:00:00Z',
        },
        {
          'id': 'm2', 'role': 'tutor', 'content': 'جرّب النشاط.',
          'responseType': 'next_step', 'interactivePayload': _numberLinePayload(),
          'interactiveResult': null, 'createdAt': '2026-07-14T10:00:05Z',
        },
        ...?extra,
      ],
    };

Map<String, dynamic> _replyBody({Map<String, dynamic>? assessment}) => {
      'conversationId': 'conv-9',
      'model': 'mock',
      'reply': {
        'message': 'تمام!',
        'responseType': 'encouragement',
        'followUpQuestion': null,
        'suggestedAction': 'none',
        'relatedConcept': null,
        'needsClarification': false,
        'interactivePayload': null,
      },
      if (assessment != null) 'assessment': assessment,
    };

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'token': 'test-token',
      'studentId': 's1',
      'tutorConversationId': 'conv-9',
    });
    await Session.load();
  });

  testWidgets('a failed block submit shows no "sent" note and re-opens for a real resubmit',
      (tester) async {
    var failNext = true;
    final posts = <Map<String, dynamic>>[];
    final mockClient = MockClient((req) async {
      if (req.method == 'GET') {
        return http.Response(jsonEncode(_thread()), 200,
            headers: {'content-type': 'application/json'});
      }
      posts.add(jsonDecode(req.body) as Map<String, dynamic>);
      if (failNext) {
        failNext = false;
        return http.Response(jsonEncode({'error': {'code': 'INTERNAL', 'message': 'boom'}}), 500,
            headers: {'content-type': 'application/json'});
      }
      return http.Response(
        jsonEncode(_replyBody(assessment: {
          'verification': 'server_verified', 'outcome': 'correct',
          'attempt': 1, 'recovered': false, 'closed': true,
        })),
        201,
        headers: {'content-type': 'application/json'},
      );
    });

    await http.runWithClient(() async {
      await tester.pumpWidget(_app(TutorChat(
        context_: TutorContext(source: 'ask'),
        persistThread: true,
      )));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 100));

      // Act on the restored block: move the marker, check.
      await tester.tap(find.byTooltip('+'));
      await tester.pump();
      await tester.tap(find.text('تحقق'));
      await tester.pump(const Duration(milliseconds: 400));

      // The POST failed: error bubble, and NO "sent to your tutor" note —
      // the block cleared its local verdict for a genuine retry.
      expect(posts, hasLength(1));
      expect(find.text('أُرسلت نتيجتك إلى مساعدك'), findsNothing);
      expect(find.textContaining('حدث خطأ'), findsOneWidget);

      // Resubmit: the check requires a real move first (reset cleared it).
      await tester.ensureVisible(find.byTooltip('+'));
      await tester.pump();
      await tester.tap(find.byTooltip('+'));
      await tester.pump();
      await tester.ensureVisible(find.text('تحقق'));
      await tester.pump();
      await tester.tap(find.text('تحقق'));
      await tester.pump(const Duration(milliseconds: 400));

      expect(posts, hasLength(2));
      expect(find.text('أُرسلت نتيجتك إلى مساعدك'), findsOneWidget);
    }, () => mockClient);
  });

  testWidgets('a restored open block shows the spent attempt budget', (tester) async {
    final mockClient = MockClient((req) async {
      return http.Response(
        jsonEncode(_thread(extra: [
          {
            'id': 'm3', 'role': 'student', 'content': 'وضعت القيمة',
            'responseType': null, 'interactivePayload': null,
            'interactiveResult': {
              'blockType': 'number_line', 'attempted': true,
              'answerOrState': 'وضعت 0.5', 'correctnessOrOutcome': 'incorrect',
            },
            'createdAt': '2026-07-14T10:01:00Z',
          },
        ])),
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    await http.runWithClient(() async {
      await tester.pumpWidget(_app(TutorChat(
        context_: TutorContext(source: 'ask'),
        persistThread: true,
      )));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 100));

      // One wrong attempt is on record: the block is OPEN (retryable) and
      // says the learner is on attempt 2 of 3.
      expect(find.text('المحاولة 2 من 3'), findsOneWidget);
      expect(find.text('تحقق'), findsOneWidget); // live manipulative, not frozen
    }, () => mockClient);
  });

  testWidgets('a restored thread resumes its study program', (tester) async {
    final posts = <Map<String, dynamic>>[];
    final key = GlobalKey<TutorChatState>();
    final mockClient = MockClient((req) async {
      if (req.method == 'GET') {
        return http.Response(jsonEncode(_thread(mode: 'exam_prep')), 200,
            headers: {'content-type': 'application/json'});
      }
      posts.add(jsonDecode(req.body) as Map<String, dynamic>);
      return http.Response(jsonEncode(_replyBody()), 201,
          headers: {'content-type': 'application/json'});
    });

    await http.runWithClient(() async {
      await tester.pumpWidget(_app(TutorChat(
        key: key,
        context_: TutorContext(source: 'ask'),
        persistThread: true,
        showStudyModes: true,
      )));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 100));

      expect(key.currentState!.activeStudyMode, 'exam_prep');
      // The running-program chip is back after the restart.
      expect(find.text('حضّرني لسبر'), findsOneWidget);

      // And the next message still carries the program id.
      await key.currentState!.send('الرياضيات، يوم الخميس، ساعة يوميًا');
      await tester.pump(const Duration(milliseconds: 400));
      expect(posts.single['context']['mode'], 'exam_prep');
    }, () => mockClient);
  });

  testWidgets('a failed program-opening message rolls the program back', (tester) async {
    SharedPreferences.setMockInitialValues({'token': 'test-token', 'studentId': 's1'});
    await Session.load();
    final key = GlobalKey<TutorChatState>();
    final mockClient = MockClient((req) async {
      return http.Response(
        jsonEncode({'error': {'code': 'RATE_LIMITED', 'message': 'slow down'}}), 429,
        headers: {'content-type': 'application/json'},
      );
    });

    await http.runWithClient(() async {
      await tester.pumpWidget(_app(TutorChat(
        key: key,
        context_: TutorContext(source: 'ask'),
        showStudyModes: true,
      )));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.tap(find.text('عندي تراكم'));
      await tester.pump(const Duration(milliseconds: 400));
    }, () => mockClient);

    // No ghost chip for a program that never started.
    expect(key.currentState!.activeStudyMode, isNull);
  });

  testWidgets('quick actions hide during a program; a program stays one tap away in free chat',
      (tester) async {
    SharedPreferences.setMockInitialValues({'token': 'test-token', 'studentId': 's1'});
    await Session.load();
    final key = GlobalKey<TutorChatState>();
    final mockClient = MockClient((req) async => http.Response(
          jsonEncode(_replyBody()), 201,
          headers: {'content-type': 'application/json'},
        ));

    await http.runWithClient(() async {
      await tester.pumpWidget(_app(TutorChat(
        key: key,
        context_: TutorContext(source: 'ask'),
        showStudyModes: true,
        quickActions: const ['اشرح ببساطة'],
      )));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 100));

      // Free chat first: quick actions visible + the mid-conversation
      // program entry point.
      await key.currentState!.send('سؤال حر');
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('اشرح ببساطة'), findsOneWidget);
      expect(find.text('أو اختر برنامج دراسة'), findsOneWidget);

      // Enter a program from the sheet — same thread, no discarding.
      await tester.tap(find.text('أو اختر برنامج دراسة'));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.text('حضّرني لسبر').last);
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));

      expect(key.currentState!.activeStudyMode, 'exam_prep');
      // In-program: the free-chat quick actions are gone.
      expect(find.text('اشرح ببساطة'), findsNothing);
    }, () => mockClient);
  });
}
