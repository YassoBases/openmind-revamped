/// Lesson Worlds client tests: pure unlock rules, world/stage model parsing,
/// the growing-world invariants, XP level curve, and the primary catalog.
import 'package:edumind/core/xp_store.dart';
import 'package:edumind/features/worlds/primary_catalog.dart';
import 'package:edumind/features/worlds/world_models.dart';
import 'package:flutter_test/flutter_test.dart';

WorldStage stage(int index, {bool done = false, int? stars}) => WorldStage(
      index: index,
      status: done ? 'ready' : 'planned',
      stars: stars ?? (done ? 2 : null),
      completedAt: done ? DateTime(2026, 7, 19) : null,
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('worldNodeStates (sequential unlocking)', () {
    test('a fresh world opens exactly stage 1', () {
      final states = worldNodeStates([stage(1), stage(2), stage(3)]);
      expect(states, [
        StageNodeState.current,
        StageNodeState.locked,
        StageNodeState.locked,
      ]);
    });

    test('completing a stage unlocks exactly the next one', () {
      final states =
          worldNodeStates([stage(1, done: true), stage(2), stage(3)]);
      expect(states, [
        StageNodeState.completed,
        StageNodeState.current,
        StageNodeState.locked,
      ]);
    });

    test('a finished world has no current node', () {
      final states =
          worldNodeStates([stage(1, done: true), stage(2, done: true)]);
      expect(states, everyElement(StageNodeState.completed));
    });

    test('a gap never unlocks past it (progress is honest)', () {
      // Completed stage 3 but not 2 (e.g. merged server state) — the child's
      // position is stage 2; stage 4 stays locked.
      final states = worldNodeStates(
          [stage(1, done: true), stage(2), stage(3, done: true), stage(4)]);
      expect(states, [
        StageNodeState.completed,
        StageNodeState.current,
        StageNodeState.completed,
        StageNodeState.locked,
      ]);
    });
  });

  group('World model', () {
    test('parses the API response shape (arc map + stages)', () {
      final world = World.fromMap({
        'id': 'w1',
        'title': 'The World of Water',
        'subject': 'Science',
        'topic': 'The Water Cycle',
        'language': 'en',
        'stageCount': 6,
        'arc': {'intro': 'A drop dreams.', 'outro': 'The drop came home.'},
        'createdAt': '2026-07-19T06:00:00.000Z',
        'stages': [
          {'index': 2, 'status': 'planned'},
          {'index': 1, 'status': 'ready', 'stars': 3, 'completedAt': '2026-07-19T07:00:00.000Z'},
        ],
      });
      expect(world.arcIntro, 'A drop dreams.');
      // stages sort by index regardless of arrival order
      expect(world.stages.first.index, 1);
      expect(world.stages.first.completed, isTrue);
      expect(world.completedCount, 1);
      expect(world.finished, isFalse);
    });

    test('round-trips through toMap/fromMap (offline copy fidelity)', () {
      final world = World.fromMap({
        'id': 'w2',
        'title': 'ت',
        'subject': 'الرياضيات',
        'topic': 'الجمع',
        'language': 'ar',
        'stageCount': 2,
        'stages': [
          {'index': 1, 'status': 'ready', 'stars': 2, 'bestAccuracy': 0.7, 'completedAt': '2026-07-19T07:00:00.000Z'},
          {'index': 2, 'status': 'planned'},
        ],
      });
      final copy = World.fromMap(world.toMap());
      expect(copy.stages[0].stars, 2);
      expect(copy.stages[0].bestAccuracy, 0.7);
      expect(copy.stages[0].completed, isTrue);
      expect(copy.stages[1].completed, isFalse);
      expect(copy.language, 'ar');
    });

    test('a malformed stage list never crashes parsing', () {
      final world = World.fromMap({'id': 'w3', 'stages': 'garbage'});
      expect(world.stages, isEmpty);
      expect(world.finished, isFalse);
    });
  });

  group('XP level curve', () {
    test('triangular thresholds: 100, 300, 600…', () {
      expect(XpStore.levelFor(0), 1);
      expect(XpStore.levelFor(99), 1);
      expect(XpStore.levelFor(100), 2);
      expect(XpStore.levelFor(299), 2);
      expect(XpStore.levelFor(300), 3);
      expect(XpStore.levelFor(599), 3);
      expect(XpStore.levelFor(600), 4);
    });
  });

  group('primary catalog', () {
    test('grade is a hard filter; both subjects load for grades 1–3 (ar)', () async {
      for (final grade in [1, 2, 3]) {
        final catalogs = await PrimaryCatalogLoader.load(grade, 'ar');
        expect(catalogs, hasLength(2), reason: 'grade $grade should carry math + science');
        for (final c in catalogs) {
          expect(c.grade, grade);
          expect(c.language, 'ar');
          expect(c.lessons.length, greaterThanOrEqualTo(6));
          for (final lesson in c.lessons) {
            expect(lesson.title, isNotEmpty);
            expect(lesson.focusConcepts, isNotEmpty);
          }
        }
      }
    });

    test('English mirrors exist with matching lesson ids', () async {
      final ar = await PrimaryCatalogLoader.load(2, 'ar');
      final en = await PrimaryCatalogLoader.load(2, 'en');
      expect(en, hasLength(2));
      for (var i = 0; i < ar.length; i++) {
        expect(
          en[i].lessons.map((l) => l.id).toList(),
          ar[i].lessons.map((l) => l.id).toList(),
          reason: 'ar/en mirrors must stay in lockstep',
        );
      }
    });

    test('an uncovered grade returns empty (never another grade\'s lessons)', () async {
      expect(await PrimaryCatalogLoader.load(5, 'ar'), isEmpty);
    });
  });
}
