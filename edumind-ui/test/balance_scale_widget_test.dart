import 'dart:convert';

import 'package:edumind/app_localizations.dart';
import 'package:edumind/core/session.dart';
import 'package:edumind/features/learn/learn_models.dart';
import 'package:edumind/features/learn/widgets/balance_scale_widget.dart';
import 'package:edumind/features/learn/widgets/learn_widget_registry.dart';
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

LearnWidgetSpec _spec() => LearnWidgetSpec(type: 'balance_scale', params: {
      'coefficient': 1, 'constant': 3, 'target': 10, 'min': 0, 'max': 20, 'step': 1,
    });

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({'token': 'test-token', 'studentId': 's1'});
    await Session.load();
  });

  testWidgets('balance_scale lesson widget: registered in kLearnWidgetBuilders', (tester) async {
    expect(kLearnWidgetBuilders.containsKey('balance_scale'), isTrue);
  });

  testWidgets(
    'balance_scale lesson widget: moving x reports interacted immediately, with no network call '
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
          await tester.pumpWidget(_app(BalanceScaleWidget(
            spec: _spec(),
            onStatus: calls.add,
          )));
          await tester.pumpAndSettle();

          await tester.tap(find.byTooltip('−'));
          await tester.pump();
        },
        () => mockClient,
      );

      expect(verifyCalls, 0, reason: 'moving x alone must not call the server');
      expect(calls, isNotEmpty);
      expect(calls.last.interacted, isTrue);
      expect(calls.last.targetMet, isFalse); // no check happened yet
    },
  );

  testWidgets(
    'balance_scale lesson widget: a server-verified correct check reports targetMet',
    (tester) async {
      // Stands in for the backend's POST /api/v1/tools/balance_scale/verify —
      // the widget must ask the SERVER, not decide locally.
      final mockClient = MockClient((req) async {
        expect(req.url.path, '/api/v1/tools/balance_scale/verify');
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        expect(body['data']['coefficient'], 1);
        expect(body['answer']['value'], 7);
        return http.Response(jsonEncode({'verdict': 'correct'}), 200);
      });

      LearnWidgetStatus? status;
      await http.runWithClient(
        () async {
          await tester.pumpWidget(_app(BalanceScaleWidget(
            spec: _spec(),
            onStatus: (s) => status = s,
          )));
          await tester.pumpAndSettle();

          // Nudge from the midpoint (10) down to 7.
          for (var i = 0; i < 3; i++) {
            await tester.tap(find.byTooltip('−'));
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
      expect(find.textContaining('متوازن'), findsOneWidget);
    },
  );

  testWidgets(
    'balance_scale lesson widget: a wrong check does not lock — learner can retry',
    (tester) async {
      var callCount = 0;
      final mockClient = MockClient((req) async {
        callCount++;
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        final value = body['answer']['value'] as num;
        final verdict = value == 7 ? 'correct' : 'incorrect';
        return http.Response(jsonEncode({'verdict': verdict}), 200);
      });

      LearnWidgetStatus? status;
      await http.runWithClient(
        () async {
          await tester.pumpWidget(_app(BalanceScaleWidget(
            spec: _spec(),
            onStatus: (s) => status = s,
          )));
          await tester.pumpAndSettle();

          // The check button stays disabled until the learner moves x — nudge
          // to 11 (still wrong: 11+3=14≠10) so the first check is a real one.
          await tester.tap(find.byTooltip('+'));
          await tester.pump();
          await tester.tap(find.text('تحقق'));
          await tester.pumpAndSettle();
          expect(status!.targetMet, isFalse);
          expect(find.textContaining('لم يتزن'), findsOneWidget);

          // Retry: nudge down to 7 and check again — the widget must still be active.
          for (var i = 0; i < 4; i++) {
            await tester.tap(find.byTooltip('−'));
            await tester.pump();
          }
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
    'balance_scale lesson widget: a network failure never crashes the lesson',
    (tester) async {
      final mockClient = MockClient((req) async => throw Exception('offline'));

      await http.runWithClient(
        () async {
          await tester.pumpWidget(_app(BalanceScaleWidget(
            spec: _spec(),
            onStatus: (_) {},
          )));
          await tester.pumpAndSettle();
          await tester.tap(find.byTooltip('+'));
          await tester.pump();
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
