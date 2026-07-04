import 'dart:convert';

import 'package:edumind/core/session.dart';
import 'package:edumind/features/learn/learn_progress_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The catalog v2 restructure moved triangle_garden from the old
/// neighborhood_engineer path into land_of_difference. Progress is sacred:
/// these tests pin the forward migration of completion and resume state.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(LearnProgressStore.resetForTesting);

  test('legacy completion key is forward-migrated on load', () async {
    SharedPreferences.setMockInitialValues({
      'learnCompleted': jsonEncode(['neighborhood_engineer/triangle_garden']),
    });
    await Session.load();

    final store = await LearnProgressStore.load();
    expect(store.isCompleted('land_of_difference', 'triangle_garden'), isTrue,
        reason: 'a station finished under the old path stays finished');
  });

  test('migration is idempotent and leaves unrelated keys alone', () async {
    SharedPreferences.setMockInitialValues({
      'learnCompleted': jsonEncode([
        'neighborhood_engineer/triangle_garden',
        'land_of_difference/triangle_garden',
        'city_keys/integers',
      ]),
    });
    await Session.load();

    final store = await LearnProgressStore.load();
    expect(store.isCompleted('land_of_difference', 'triangle_garden'), isTrue);
    expect(store.isCompleted('city_keys', 'integers'), isTrue);
  });

  test('a fresh install has nothing to migrate', () async {
    SharedPreferences.setMockInitialValues({});
    await Session.load();

    final store = await LearnProgressStore.load();
    expect(store.completed, isEmpty);
  });

  test('a legacy resume marker points at the new path', () async {
    SharedPreferences.setMockInitialValues({
      'learnResume': jsonEncode({
        'pathId': 'neighborhood_engineer',
        'experienceId': 'triangle_garden',
        'step': 2,
      }),
    });
    await Session.load();

    final store = await LearnProgressStore.load();
    expect(
      store.resume,
      (pathId: 'land_of_difference', experienceId: 'triangle_garden', step: 2),
    );
  });

  test('check results round-trip and last write wins on replay', () async {
    SharedPreferences.setMockInitialValues({});
    await Session.load();

    final store = await LearnProgressStore.load();
    expect(store.checkResult('land_of_difference', 'triangle_garden'), isNull);

    await store.saveCheckResult('land_of_difference', 'triangle_garden', 1, 3);
    expect(store.checkResult('land_of_difference', 'triangle_garden'), (1, 3));

    await store.saveCheckResult('land_of_difference', 'triangle_garden', 3, 3);
    expect(store.checkResult('land_of_difference', 'triangle_garden'), (3, 3));
  });
}
