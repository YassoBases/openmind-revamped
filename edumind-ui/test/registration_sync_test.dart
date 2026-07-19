import 'dart:convert';

import 'package:edumind/core/profile_bridge.dart';
import 'package:edumind/core/registration_sync.dart';
import 'package:edumind/core/session.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Registration sync: onboarding must never lose a learner's profile just
/// because the backend was unreachable at the moment they finished setup.
///
///  - offline onboarding keeps the local profile and marks registration
///    pending (no device token yet);
///  - a later retry (app startup, resume, or right before an online action)
///    registers successfully once the server is reachable;
///  - a fresh process (simulated "app restart") with a pending profile
///    retries and succeeds the same way;
///  - repeated/concurrent retry attempts never create a second account or
///    fire a second request once one succeeds.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Map<String, dynamic> studentBody({String id = 'sid-1'}) => {
        'studentId': id,
        'token': 'tok-$id',
        'student': {
          'id': id,
          'name': 'Nour',
          'grade': 7,
          'stage': 'middle_interactive_learning',
          'language': 'ar',
          'color': '#1CB0F6',
          'interests': ['tech_robotics'],
        },
      };

  test('offline onboarding keeps the local profile and marks registration pending', () async {
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();
    await Session.instance.setProfile({
      'name': 'Nour',
      'grade': 7,
      'stage': 'middle_interactive_learning',
      'language': 'ar',
      'color': '#1CB0F6',
      'dailyGoal': 3,
    });

    final unreachable = MockClient((req) async => throw const SocketExceptionStub());
    await http.runWithClient(() async {
      final registered = await RegistrationSync.retry();
      expect(registered, isFalse);
    }, () => unreachable);

    // The local profile survives untouched — nothing about onboarding was lost.
    expect(Session.instance.onboarded, isTrue);
    expect(Session.instance.name, 'Nour');
    expect(Session.instance.grade, 7);
    // ...but registration is explicitly pending: no device token yet.
    expect(Session.instance.registered, isFalse);
    expect(RegistrationSync.isPending, isTrue);
  });

  test('a successful retry registers the pending profile and clears the pending state', () async {
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();
    await Session.instance.setProfile({'name': 'Sami', 'grade': 5, 'dailyGoal': 3});
    expect(RegistrationSync.isPending, isTrue);

    var posts = 0;
    final mockClient = MockClient((req) async {
      posts++;
      return http.Response(jsonEncode(studentBody()), 201,
          headers: {'content-type': 'application/json'});
    });

    await http.runWithClient(() async {
      final registered = await RegistrationSync.retry();
      expect(registered, isTrue);
    }, () => mockClient);

    expect(posts, 1);
    expect(Session.instance.registered, isTrue);
    expect(Session.instance.token, 'tok-sid-1');
    expect(RegistrationSync.isPending, isFalse);
    // The server's trusted view was merged in (grade/stage/interests).
    expect(Session.instance.grade, 7);
    expect(Session.instance.interests, ['tech_robotics']);
  });

  test('a fresh process (app restart) with a pending profile retries and succeeds', () async {
    // Simulates a cold start: an onboarded profile survived (SharedPreferences
    // is disk-backed in the real app), but no token — registration never
    // completed before the app was killed/restarted. Session reads both
    // straight from storage on every call, so re-establishing exactly this
    // state through its own setters is a faithful restart simulation.
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();
    await Session.instance.setProfile({'name': 'Laila', 'grade': 8, 'dailyGoal': 3});
    expect(Session.instance.onboarded, isTrue);
    expect(Session.instance.registered, isFalse);
    expect(RegistrationSync.isPending, isTrue);

    final mockClient = MockClient((req) async => http.Response(
          jsonEncode(studentBody(id: 'sid-restart')),
          201,
          headers: {'content-type': 'application/json'},
        ));

    await http.runWithClient(() async {
      final registered = await RegistrationSync.retry();
      expect(registered, isTrue);
    }, () => mockClient);

    expect(Session.instance.registered, isTrue);
    expect(Session.instance.token, 'tok-sid-restart');
  });

  test('repeated retry attempts never fire more than one request, and never double-register',
      () async {
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();
    await Session.instance.setProfile({'name': 'Zaid', 'grade': 3, 'dailyGoal': 3});

    var posts = 0;
    final mockClient = MockClient((req) async {
      posts++;
      // A slow server — long enough that concurrent retry() calls overlap.
      await Future<void>.delayed(const Duration(milliseconds: 50));
      return http.Response(jsonEncode(studentBody(id: 'sid-once')), 201,
          headers: {'content-type': 'application/json'});
    });

    await http.runWithClient(() async {
      // Two concurrent retries (e.g. EduMindRoot.initState racing a
      // just-opened Ask Hudhud sheet) must collapse into one request.
      final results = await Future.wait([RegistrationSync.retry(), RegistrationSync.retry()]);
      expect(results, [true, true]);
      expect(posts, 1);

      // And once registered, further retries (a later resume, a later
      // send()) are pure no-ops — no new request, no new account.
      await RegistrationSync.retry();
      await RegistrationSync.retry();
      expect(posts, 1);
    }, () => mockClient);

    expect(Session.instance.token, 'tok-sid-once');
  });

  test('ProfileBridge.finishSetup leaves the account pending offline, without losing the profile',
      () async {
    SharedPreferences.setMockInitialValues({});
    await Session.load();
    await Session.instance.reset();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('user_name', 'Huda');
    await prefs.setInt('user_grade', 6);
    await prefs.setStringList('user_interests_v2', ['drawing_design']);

    final unreachable = MockClient((req) async => throw const SocketExceptionStub());
    await http.runWithClient(() async {
      await ProfileBridge.finishSetup(colorHex: '#58CC02', language: 'en');
    }, () => unreachable);

    expect(Session.instance.onboarded, isTrue);
    expect(Session.instance.name, 'Huda');
    expect(Session.instance.interests, ['drawing_design']);
    expect(Session.instance.registered, isFalse);
    expect(RegistrationSync.isPending, isTrue);
  });
}

/// A minimal stand-in for the connection-refused/DNS-failure exceptions a
/// real offline device throws — MockClient just needs something Exception
/// to reject the request with.
class SocketExceptionStub implements Exception {
  const SocketExceptionStub();
  @override
  String toString() => 'SocketExceptionStub: offline';
}
