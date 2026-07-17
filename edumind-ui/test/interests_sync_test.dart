import 'dart:convert';

import 'package:edumind/core/interests_sync.dart';
import 'package:edumind/core/session.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Interests sync: a local interests edit must never be reported as saved
/// when `PATCH /students/me` actually failed, and the server's copy — the
/// only one Ask Hudhud ever reads — must end up consistent with the local
/// pick once connectivity returns.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  void registered() {
    SharedPreferences.setMockInitialValues({'token': 'tok', 'studentId': 's1'});
  }

  Map<String, dynamic> meBody(List<String> interests) => {
        'id': 's1',
        'name': 'Rami',
        'grade': 8,
        'stage': 'middle_interactive_learning',
        'language': 'ar',
        'color': '#1CB0F6',
        'interests': interests,
      };

  test('a failed PATCH leaves interests pending — never silently reported as saved', () async {
    registered();
    await Session.load();
    await Session.instance.setProfile({'name': 'Rami', 'grade': 8, 'dailyGoal': 3});

    await Session.instance.setInterests(['tech_robotics']);
    expect(Session.instance.interestsSyncPending, isTrue);

    final failing = MockClient((req) async => http.Response(
          jsonEncode({'error': {'code': 'INTERNAL', 'message': 'boom'}}), 500,
          headers: {'content-type': 'application/json'},
        ));

    await http.runWithClient(() async {
      final synced = await InterestsSync.retry();
      expect(synced, isFalse);
    }, () => failing);

    // Local UI still shows the pick (offline-first)...
    expect(Session.instance.interests, ['tech_robotics']);
    // ...but it is explicitly NOT confirmed by the server.
    expect(Session.instance.interestsSyncPending, isTrue);
  });

  test('retry succeeds once the server is reachable and clears the pending state', () async {
    registered();
    await Session.load();
    await Session.instance.setProfile({'name': 'Rami', 'grade': 8, 'dailyGoal': 3});
    await Session.instance.setInterests(['nature_environment']);
    expect(Session.instance.interestsSyncPending, isTrue);

    Map<String, dynamic>? sentBody;
    final mockClient = MockClient((req) async {
      sentBody = jsonDecode(req.body) as Map<String, dynamic>;
      return http.Response(jsonEncode(meBody(['nature_environment'])), 200,
          headers: {'content-type': 'application/json'});
    });

    await http.runWithClient(() async {
      final synced = await InterestsSync.retry();
      expect(synced, isTrue);
    }, () => mockClient);

    expect(sentBody!['interests'], ['nature_environment']);
    expect(Session.instance.interests, ['nature_environment']);
    expect(Session.instance.interestsSyncPending, isFalse);
  });

  test('app restart with a pending edit retries and reconciles with the server', () async {
    // Cold start: a local interests edit never got confirmed by the server
    // before the process died. Session reads its state straight from
    // storage on every call, so re-establishing it through the same setters
    // onboarding/the interests sheet use is a faithful restart simulation.
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();
    await Session.instance.setAuth('s1', 'tok');
    await Session.instance.setProfile({'name': 'Sara', 'grade': 8, 'dailyGoal': 3});
    await Session.instance.setInterests(['sports_movement']);
    expect(Session.instance.interestsSyncPending, isTrue);

    // A routine startup profile refresh (GET /students/me, e.g.
    // EduMindRoot._refreshIdentity) must NOT clobber the pending local pick
    // with the server's still-stale copy.
    await Session.instance.applyStudentView(meBody(['helping_people']));
    expect(Session.instance.interests, ['sports_movement']);

    final mockClient = MockClient((req) async => http.Response(
          jsonEncode(meBody(['sports_movement'])), 200,
          headers: {'content-type': 'application/json'},
        ));

    await http.runWithClient(() async {
      final synced = await InterestsSync.retry();
      expect(synced, isTrue);
    }, () => mockClient);

    expect(Session.instance.interests, ['sports_movement']);
    expect(Session.instance.interestsSyncPending, isFalse);
  });

  test('two-interest update: both picks round-trip and sync correctly', () async {
    registered();
    await Session.load();
    await Session.instance.setProfile({'name': 'Yara', 'grade': 8, 'dailyGoal': 3});
    await Session.instance.setInterests(['tech_robotics', 'drawing_design']);

    Map<String, dynamic>? sentBody;
    final mockClient = MockClient((req) async {
      sentBody = jsonDecode(req.body) as Map<String, dynamic>;
      return http.Response(jsonEncode(meBody(['tech_robotics', 'drawing_design'])), 200,
          headers: {'content-type': 'application/json'});
    });

    await http.runWithClient(() async {
      final synced = await InterestsSync.retry();
      expect(synced, isTrue);
    }, () => mockClient);

    expect(sentBody!['interests'], ['tech_robotics', 'drawing_design']);
    expect(Session.instance.interests, ['tech_robotics', 'drawing_design']);
    expect(Session.instance.interestsSyncPending, isFalse);
  });

  test('repeated retry calls make only one request while a sync is already in flight', () async {
    registered();
    await Session.load();
    await Session.instance.setProfile({'name': 'Omar', 'grade': 5, 'dailyGoal': 3});
    await Session.instance.setInterests(['games_challenges']);

    var patches = 0;
    final mockClient = MockClient((req) async {
      patches++;
      await Future<void>.delayed(const Duration(milliseconds: 50));
      return http.Response(jsonEncode(meBody(['games_challenges'])), 200,
          headers: {'content-type': 'application/json'});
    });

    await http.runWithClient(() async {
      final results = await Future.wait([InterestsSync.retry(), InterestsSync.retry()]);
      expect(results, [true, true]);
      expect(patches, 1);

      // Already confirmed — a later retry is a pure no-op.
      await InterestsSync.retry();
      expect(patches, 1);
    }, () => mockClient);
  });

  test('not registered yet: retry is a no-op and stays pending (registration comes first)',
      () async {
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();
    await Session.instance.setProfile({'name': 'Nour', 'grade': 7, 'dailyGoal': 3});
    await Session.instance.setInterests(['reading_stories']);
    expect(Session.instance.registered, isFalse);

    final mockClient = MockClient((req) async {
      fail('no request should be made before the account is registered');
    });

    await http.runWithClient(() async {
      final synced = await InterestsSync.retry();
      expect(synced, isFalse);
    }, () => mockClient);

    expect(Session.instance.interestsSyncPending, isTrue);
  });
}
