import 'package:edumind/features/learn/journey_logic.dart';
import 'package:edumind/features/learn/learn_models.dart';
import 'package:flutter_test/flutter_test.dart';

LearnExperience _exp(String id, {bool ready = true}) => LearnExperience.fromMap({
      'id': id,
      'title': id,
      'status': ready ? 'ready' : 'soon',
      'steps': ready
          ? [
              {'kind': 'scene', 'title': 's'},
            ]
          : [],
    });

LearnPath _path(String id, List<LearnExperience> experiences) => LearnPath(
      id: id,
      title: id,
      tagline: '',
      emoji: '⭐',
      colorHex: '#1CB0F6',
      experiences: experiences,
    );

LearnCatalog _catalog(List<LearnPath> paths) => LearnCatalog(
      language: 'ar',
      subject: 'الرياضيات',
      grade: 7,
      paths: paths,
    );

void main() {
  group('journeyNodeStates', () {
    test('first ready experience is the current position on a fresh path', () {
      final path = _path('p', [_exp('a'), _exp('b'), _exp('c', ready: false)]);
      expect(journeyNodeStates(path, {}), [
        JourneyNodeState.current,
        JourneyNodeState.locked,
        JourneyNodeState.soon,
      ]);
    });

    test('completing an experience unlocks the next ready one', () {
      final path = _path('p', [_exp('a'), _exp('b'), _exp('c')]);
      expect(journeyNodeStates(path, {'p/a'}), [
        JourneyNodeState.completed,
        JourneyNodeState.current,
        JourneyNodeState.locked,
      ]);
    });

    test('soon placeholders never unlock and never block the sequence', () {
      final path = _path('p', [_exp('a'), _exp('b', ready: false), _exp('c')]);
      expect(journeyNodeStates(path, {'p/a'}), [
        JourneyNodeState.completed,
        JourneyNodeState.soon,
        JourneyNodeState.current,
      ]);
    });

    test('a fully completed path has no current node', () {
      final path = _path('p', [_exp('a'), _exp('b')]);
      final states = journeyNodeStates(path, {'p/a', 'p/b'});
      expect(states, everyElement(JourneyNodeState.completed));
    });

    test('progress keys are namespaced per path', () {
      final path = _path('p2', [_exp('a')]);
      // completion recorded for another path must not leak in
      expect(journeyNodeStates(path, {'p1/a'}), [JourneyNodeState.current]);
    });
  });

  group('nextExperience', () {
    test('prefers the path already in progress over a fresh one', () {
      final catalogs = [
        _catalog([
          _path('fresh', [_exp('f1'), _exp('f2')]),
          _path('started', [_exp('s1'), _exp('s2')]),
        ]),
      ];
      final next = nextExperience(catalogs, {'started/s1'});
      expect(next, isNotNull);
      expect(next!.path.id, 'started');
      expect(next.experience.id, 's2');
    });

    test('falls back to the first current node when nothing is started', () {
      final catalogs = [
        _catalog([
          _path('one', [_exp('a')]),
          _path('two', [_exp('b')]),
        ]),
      ];
      final next = nextExperience(catalogs, {});
      expect(next!.path.id, 'one');
      expect(next.experience.id, 'a');
    });

    test('returns null when every ready experience is completed', () {
      final catalogs = [
        _catalog([
          _path('p', [_exp('a'), _exp('b', ready: false)]),
        ]),
      ];
      expect(nextExperience(catalogs, {'p/a'}), isNull);
    });
  });

  group('startAction (honest Home labels)', () {
    test('fresh learner gets begin («ابدأ التجربة»)', () {
      final catalogs = [
        _catalog([
          _path('p', [_exp('a'), _exp('b')]),
        ]),
      ];
      final action = startAction(catalogs, {});
      expect(action!.kind, StartActionKind.begin);
      expect(action.position.experience.id, 'a');
      expect(action.step, 0);
    });

    test('in-progress path gets exploreNext («استكشف المفهوم التالي»)', () {
      final catalogs = [
        _catalog([
          _path('p', [_exp('a'), _exp('b')]),
        ]),
      ];
      final action = startAction(catalogs, {'p/a'});
      expect(action!.kind, StartActionKind.exploreNext);
      expect(action.position.experience.id, 'b');
    });

    test('resume («تابع التجربة») only with a real saved position on the current node', () {
      final catalogs = [
        _catalog([
          _path('p', [_exp('a'), _exp('b')]),
        ]),
      ];
      final action = startAction(catalogs, {},
          resumePathId: 'p', resumeExperienceId: 'a', resumeStep: 2);
      expect(action!.kind, StartActionKind.resume);
      expect(action.position.experience.id, 'a');
      expect(action.step, 2);
    });

    test('a stale resume marker (experience since completed) is ignored', () {
      final catalogs = [
        _catalog([
          _path('p', [_exp('a'), _exp('b')]),
        ]),
      ];
      final action = startAction(catalogs, {'p/a'},
          resumePathId: 'p', resumeExperienceId: 'a', resumeStep: 2);
      expect(action!.kind, StartActionKind.exploreNext);
      expect(action.position.experience.id, 'b');
      expect(action.step, 0);
    });

    test('a resume marker at step 0 never claims resumability', () {
      final catalogs = [
        _catalog([
          _path('p', [_exp('a')]),
        ]),
      ];
      final action = startAction(catalogs, {},
          resumePathId: 'p', resumeExperienceId: 'a', resumeStep: 0);
      expect(action!.kind, StartActionKind.begin);
    });

    test('null when everything ready is completed', () {
      final catalogs = [
        _catalog([
          _path('p', [_exp('a'), _exp('b', ready: false)]),
        ]),
      ];
      expect(startAction(catalogs, {'p/a'}), isNull);
    });
  });

  test('pathProgress counts only ready experiences', () {
    final path = _path('p', [_exp('a'), _exp('b'), _exp('c', ready: false)]);
    expect(pathProgress(path, {'p/a'}), (1, 2));
    expect(pathProgress(path, <String>{}), (0, 2));
  });
}
