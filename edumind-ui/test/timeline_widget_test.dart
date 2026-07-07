import 'dart:convert';

import 'package:edumind/app_localizations.dart';
import 'package:edumind/core/session.dart';
import 'package:edumind/features/learn/learn_models.dart';
import 'package:edumind/features/learn/widgets/learn_widget_registry.dart';
import 'package:edumind/features/learn/widgets/timeline_widget.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

Widget _app(Widget child) => MaterialApp(
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

LearnWidgetSpec _spec() => LearnWidgetSpec(type: 'timeline', params: {
      'items': [
        {'id': 'ottoman_end', 'label': '١٩١٨ – نهاية الحكم العثماني'},
        {'id': 'mandate', 'label': '١٩٢٠ – بدء الانتداب الفرنسي'},
        {'id': 'revolt', 'label': '١٩٢٥ – الثورة السورية الكبرى'},
        {'id': 'independence', 'label': '١٩٤٦ – عيد الجلاء'},
      ],
      'correctOrder': ['ottoman_end', 'mandate', 'revolt', 'independence'],
    });

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({'token': 'test-token', 'studentId': 's1'});
    await Session.load();
  });

  testWidgets('timeline lesson widget: registered in kLearnWidgetBuilders', (tester) async {
    expect(kLearnWidgetBuilders.containsKey('timeline'), isTrue);
  });

  testWidgets(
    'timeline lesson widget: placing one event reports interacted immediately, with no network call '
    '(an "explore" step must unlock without waiting for a check)',
    (tester) async {
      final calls = <LearnWidgetStatus>[];
      var verifyCalls = 0;
      final mockClient = MockClient((req) async {
        verifyCalls++;
        return http.Response(jsonEncode({'verdict': 'correct'}), 200);
      });

      await http.runWithClient(
        () async {
          await tester.pumpWidget(_app(TimelineWidget(
            spec: _spec(),
            onStatus: calls.add,
          )));
          await tester.pumpAndSettle();

          await tester.tap(find.text('١٩١٨ – نهاية الحكم العثماني'));
          await tester.pump();
        },
        () => mockClient,
      );

      expect(verifyCalls, 0, reason: 'placing one event alone must not call the server');
      expect(calls, isNotEmpty);
      expect(calls.last.interacted, isTrue);
      expect(calls.last.targetMet, isFalse); // no check happened yet
    },
  );

  testWidgets(
    'timeline lesson widget: a server-verified correct order reports targetMet',
    (tester) async {
      final mockClient = MockClient((req) async {
        expect(req.url.path, '/api/v1/tools/timeline/verify');
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        expect(body['answer']['order'],
            ['ottoman_end', 'mandate', 'revolt', 'independence']);
        return http.Response(jsonEncode({'verdict': 'correct'}), 200);
      });

      LearnWidgetStatus? status;
      await http.runWithClient(
        () async {
          await tester.pumpWidget(_app(TimelineWidget(
            spec: _spec(),
            onStatus: (s) => status = s,
          )));
          await tester.pumpAndSettle();

          for (final label in ['١٩١٨ – نهاية الحكم العثماني', '١٩٢٠ – بدء الانتداب الفرنسي',
              '١٩٢٥ – الثورة السورية الكبرى', '١٩٤٦ – عيد الجلاء']) {
            await tester.tap(find.text(label));
            await tester.pump();
          }
          await tester.tap(find.text('تحقق'));
          await tester.pumpAndSettle();
        },
        () => mockClient,
      );

      expect(status, isNotNull);
      expect(status!.interacted, isTrue);
      expect(status!.targetMet, isTrue);
      expect(find.textContaining('الترتيب الصحيح'), findsOneWidget);
    },
  );

  testWidgets(
    'timeline lesson widget: a wrong order does not lock — learner can retry',
    (tester) async {
      var callCount = 0;
      final mockClient = MockClient((req) async {
        callCount++;
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        final order = (body['answer']['order'] as List).cast<String>();
        const correct = ['ottoman_end', 'mandate', 'revolt', 'independence'];
        final verdict = order.toString() == correct.toString() ? 'correct' : 'incorrect';
        return http.Response(jsonEncode({'verdict': verdict}), 200);
      });

      LearnWidgetStatus? status;
      await http.runWithClient(
        () async {
          await tester.pumpWidget(_app(TimelineWidget(
            spec: _spec(),
            onStatus: (s) => status = s,
          )));
          await tester.pumpAndSettle();

          // Wrong order first: swap the middle two.
          for (final label in ['١٩١٨ – نهاية الحكم العثماني', '١٩٢٥ – الثورة السورية الكبرى',
              '١٩٢٠ – بدء الانتداب الفرنسي', '١٩٤٦ – عيد الجلاء']) {
            await tester.tap(find.text(label));
            await tester.pump();
          }
          await tester.tap(find.text('تحقق'));
          await tester.pumpAndSettle();
          expect(status!.targetMet, isFalse);
          expect(find.textContaining('ليس تمامًا'), findsOneWidget);

          // Retry: take back the misplaced pair (tap placed nodes to remove)
          // and re-place in the correct order.
          await tester.tap(find.text('١٩٢٥ – الثورة السورية الكبرى'));
          await tester.pump();
          await tester.tap(find.text('١٩٢٠ – بدء الانتداب الفرنسي'));
          await tester.pump();
          await tester.tap(find.text('١٩٤٦ – عيد الجلاء'));
          await tester.pump();
          await tester.tap(find.text('١٩٢٠ – بدء الانتداب الفرنسي'));
          await tester.pump();
          await tester.tap(find.text('١٩٢٥ – الثورة السورية الكبرى'));
          await tester.pump();
          await tester.tap(find.text('١٩٤٦ – عيد الجلاء'));
          await tester.pump();
          await tester.tap(find.text('تحقق'));
          await tester.pumpAndSettle();
        },
        () => mockClient,
      );

      expect(callCount, 2);
      expect(status!.targetMet, isTrue);
    },
  );

  testWidgets(
    'timeline lesson widget: a network failure never crashes the lesson',
    (tester) async {
      final mockClient = MockClient((req) async => throw Exception('offline'));

      await http.runWithClient(
        () async {
          await tester.pumpWidget(_app(TimelineWidget(
            spec: _spec(),
            onStatus: (_) {},
          )));
          await tester.pumpAndSettle();
          for (final label in ['١٩١٨ – نهاية الحكم العثماني', '١٩٢٠ – بدء الانتداب الفرنسي',
              '١٩٢٥ – الثورة السورية الكبرى', '١٩٤٦ – عيد الجلاء']) {
            await tester.tap(find.text(label));
            await tester.pump();
          }
          await tester.tap(find.text('تحقق'));
          await tester.pumpAndSettle();
        },
        () => mockClient,
      );

      expect(tester.takeException(), isNull);
      expect(find.textContaining('تعذّر الوصول'), findsOneWidget);
    },
  );
}
