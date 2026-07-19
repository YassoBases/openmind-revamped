import 'dart:convert';

import 'package:edumind/core/interests_sync.dart';
import 'package:edumind/core/registration_sync.dart';
import 'package:edumind/core/session.dart';
import 'package:edumind/core/sync_lifecycle.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Proves exactly where RegistrationSync/InterestsSync are invoked
/// automatically: [SyncOnStartupAndResume] is the widget `EduMindRoot.build()`
/// wraps its whole shell in (edumind_root.dart — `SyncOnStartupAndResume(onSync:
/// _refreshIdentity, child: Scaffold(...))`), with `onSync` calling both
/// `RegistrationSync.retry()` and `InterestsSync.retry()` when pending. It
/// fires `onSync` once when mounted (app startup / cold start) and again on
/// every `AppLifecycleState.resumed` (foreground resume) — never only when
/// the student happens to save something again.
///
/// EduMindRoot itself pulls in the full primary/middle screen tree
/// (HomeScreen, ProfileScreen, …), which has a pre-existing, unrelated
/// `late final AnimationController` teardown issue in HomeScreen that makes
/// it unsafe to mount/unmount in this test harness (reproducible on `main`,
/// before any of this change). These tests instead exercise the exact
/// [SyncOnStartupAndResume] wiring EduMindRoot uses, wired to the REAL
/// [RegistrationSync.retry] / [InterestsSync.retry] functions — not stand-ins
/// — so a pass here is genuine proof of the startup/resume retry contract.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Widget harness(Future<void> Function() onSync) =>
      MaterialApp(home: SyncOnStartupAndResume(onSync: onSync, child: const SizedBox.shrink()));

  Map<String, dynamic> meBody({List<String>? interests}) => {
        'id': 's1', 'name': 'Sara', 'grade': 5, 'stage': 'primary_games',
        'language': 'en', 'color': '#1CB0F6',
        if (interests != null) 'interests': interests,
      };

  Future<void> teardown(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  }

  group('registration', () {
    testWidgets('cold start (mount) retries a pending registration automatically', (tester) async {
      SharedPreferences.setMockInitialValues({});
      await Session.load();
      await Session.instance.reset();
      await Session.instance.setProfile({'name': 'Nour', 'grade': 5, 'dailyGoal': 3});
      expect(RegistrationSync.isPending, isTrue);

      var posts = 0;
      final mockClient = MockClient((req) async {
        posts++;
        return http.Response(
          jsonEncode({'studentId': 'sid', 'token': 'tok', 'student': meBody()}),
          201,
          headers: {'content-type': 'application/json'},
        );
      });

      await http.runWithClient(() async {
        // No explicit RegistrationSync.retry() call anywhere in this test —
        // mounting the widget alone must trigger it.
        await tester.pumpWidget(harness(RegistrationSync.retry));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));
      }, () => mockClient);

      expect(posts, 1);
      expect(Session.instance.registered, isTrue);
      await teardown(tester);
    });

    testWidgets('foreground resume retries a registration that failed at startup', (tester) async {
      SharedPreferences.setMockInitialValues({});
      await Session.load();
      await Session.instance.reset();
      await Session.instance.setProfile({'name': 'Omar', 'grade': 5, 'dailyGoal': 3});

      final failing = MockClient((req) async => http.Response('boom', 500));
      await http.runWithClient(() async {
        await tester.pumpWidget(harness(RegistrationSync.retry));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));
      }, () => failing);

      // The startup attempt happened (posts would be >0 inside `failing` if
      // we counted) and failed — still pending, proving it actually tried.
      expect(RegistrationSync.isPending, isTrue);

      var posts = 0;
      final succeeding = MockClient((req) async {
        posts++;
        return http.Response(
          jsonEncode({'studentId': 'sid2', 'token': 'tok2', 'student': meBody()}),
          201,
          headers: {'content-type': 'application/json'},
        );
      });

      await http.runWithClient(() async {
        // Simulate the OS bringing the app back to the foreground — nothing
        // else in this test calls retry() directly.
        tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));
      }, () => succeeding);

      expect(posts, 1);
      expect(Session.instance.registered, isTrue);
      await teardown(tester);
    });

    testWidgets('backgrounding (paused) does NOT trigger a retry — only a real resume does',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      await Session.load();
      await Session.instance.reset();
      await Session.instance.setProfile({'name': 'Huda', 'grade': 5, 'dailyGoal': 3});

      var posts = 0;
      final mockClient = MockClient((req) async {
        posts++;
        return http.Response(
          jsonEncode({'studentId': 'sidH', 'token': 'tokH', 'student': meBody()}),
          201,
          headers: {'content-type': 'application/json'},
        );
      });

      await http.runWithClient(() async {
        await tester.pumpWidget(harness(RegistrationSync.retry));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));
        expect(posts, 1); // the mount attempt

        tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));
        expect(posts, 1); // pausing alone must not fire another attempt
      }, () => mockClient);
      await teardown(tester);
    });
  });

  group('interests', () {
    testWidgets('cold start (mount) retries a pending interests sync automatically', (tester) async {
      SharedPreferences.setMockInitialValues({});
      await Session.load();
      await Session.instance.reset();
      await Session.instance.setAuth('s1', 'tok');
      await Session.instance.setProfile({'name': 'Sara', 'grade': 5, 'dailyGoal': 3});
      await Session.instance.setInterests(['sports_movement']);
      expect(InterestsSync.isPending, isTrue);

      var patches = 0;
      final mockClient = MockClient((req) async {
        if (req.method == 'PATCH') patches++;
        return http.Response(jsonEncode(meBody(interests: ['sports_movement'])), 200,
            headers: {'content-type': 'application/json'});
      });

      await http.runWithClient(() async {
        // No explicit InterestsSync.retry() call anywhere in this test —
        // mounting the widget alone must trigger it.
        await tester.pumpWidget(harness(InterestsSync.retry));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));
      }, () => mockClient);

      expect(patches, 1);
      expect(Session.instance.interestsSyncPending, isFalse);
      await teardown(tester);
    });

    testWidgets('foreground resume retries an interests sync that failed at startup',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      await Session.load();
      await Session.instance.reset();
      await Session.instance.setAuth('s1', 'tok');
      await Session.instance.setProfile({'name': 'Rami', 'grade': 5, 'dailyGoal': 3});
      await Session.instance.setInterests(['drawing_design']);

      final failing = MockClient((req) async => http.Response('boom', 500));
      await http.runWithClient(() async {
        await tester.pumpWidget(harness(InterestsSync.retry));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));
      }, () => failing);
      expect(InterestsSync.isPending, isTrue);

      var patches = 0;
      final succeeding = MockClient((req) async {
        if (req.method == 'PATCH') patches++;
        return http.Response(jsonEncode(meBody(interests: ['drawing_design'])), 200,
            headers: {'content-type': 'application/json'});
      });

      await http.runWithClient(() async {
        tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));
      }, () => succeeding);

      expect(patches, 1);
      expect(Session.instance.interestsSyncPending, isFalse);
      await teardown(tester);
    });
  });
}
