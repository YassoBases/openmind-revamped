/// Pure journey-map rules for "رحلتي" — no widgets, fully unit-testable.
///
/// Within a path, ready experiences unlock sequentially: the first is always
/// open, each next one opens when the previous ready experience is completed.
/// `soon` placeholders never unlock and never block the sequence. The single
/// non-completed unlocked node of a path is the learner's position ("current").
library;

import 'learn_models.dart';

enum JourneyNodeState { completed, current, locked, soon }

/// State for every experience of [path], in catalog order.
List<JourneyNodeState> journeyNodeStates(LearnPath path, Set<String> completed) {
  final states = <JourneyNodeState>[];
  var previousReadyDone = true; // the first ready experience is always open
  var currentAssigned = false;
  for (final e in path.experiences) {
    if (!e.ready) {
      states.add(JourneyNodeState.soon);
      continue;
    }
    final done = completed.contains('${path.id}/${e.id}');
    if (done) {
      states.add(JourneyNodeState.completed);
    } else if (previousReadyDone && !currentAssigned) {
      states.add(JourneyNodeState.current);
      currentAssigned = true;
    } else {
      states.add(JourneyNodeState.locked);
    }
    previousReadyDone = done;
  }
  return states;
}

/// A journey position: one openable experience inside its path.
typedef JourneyPosition = ({LearnPath path, LearnExperience experience});

/// Where the learner should continue: the current node of the first path
/// already in progress (some but not all ready experiences completed);
/// otherwise the first current node anywhere. Null when every ready
/// experience is completed.
JourneyPosition? nextExperience(List<LearnCatalog> catalogs, Set<String> completed) {
  JourneyPosition? firstFresh;
  for (final catalog in catalogs) {
    for (final path in catalog.paths) {
      final states = journeyNodeStates(path, completed);
      final idx = states.indexOf(JourneyNodeState.current);
      if (idx < 0) continue;
      final position = (path: path, experience: path.experiences[idx]);
      final started = states.contains(JourneyNodeState.completed);
      if (started) return position;
      firstFresh ??= position;
    }
  }
  return firstFresh;
}

/// What Home's single primary action honestly is (labels in that order):
///  - [resume]      «تابع التجربة» — a persisted mid-experience position exists
///  - [exploreNext] «استكشف المفهوم التالي» — the path is already in progress
///  - [begin]       «ابدأ التجربة» — nothing resumable, a fresh path start
enum StartActionKind { begin, exploreNext, resume }

typedef StartAction = ({
  StartActionKind kind,
  JourneyPosition position,
  int step, // 0 unless kind == resume
});

/// Home's one action, honestly derived from real state. A resume marker only
/// counts when it still points at the learner's actual current (openable,
/// uncompleted) node — otherwise it is stale and the map decides. Null when
/// every ready experience is completed.
StartAction? startAction(
  List<LearnCatalog> catalogs,
  Set<String> completed, {
  String? resumePathId,
  String? resumeExperienceId,
  int resumeStep = 0,
}) {
  if (resumePathId != null && resumeExperienceId != null && resumeStep > 0) {
    for (final catalog in catalogs) {
      for (final path in catalog.paths) {
        if (path.id != resumePathId) continue;
        final states = journeyNodeStates(path, completed);
        for (var i = 0; i < path.experiences.length; i++) {
          if (path.experiences[i].id == resumeExperienceId &&
              states[i] == JourneyNodeState.current) {
            return (
              kind: StartActionKind.resume,
              position: (path: path, experience: path.experiences[i]),
              step: resumeStep,
            );
          }
        }
      }
    }
  }
  final next = nextExperience(catalogs, completed);
  if (next == null) return null;
  final (done, _) = pathProgress(next.path, completed);
  return (
    kind: done > 0 ? StartActionKind.exploreNext : StartActionKind.begin,
    position: next,
    step: 0,
  );
}

/// (done, ready) counts for a path — the map header's progress numbers.
(int done, int ready) pathProgress(LearnPath path, Set<String> completed) {
  final ready = path.experiences.where((e) => e.ready).length;
  final done = path.experiences
      .where((e) => e.ready && completed.contains('${path.id}/${e.id}'))
      .length;
  return (done, ready);
}
