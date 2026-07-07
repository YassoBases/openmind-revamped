/// Pure checkpoint assembly — no widgets, fully unit-testable. A checkpoint is
/// never authored content: it is built at runtime from the learner's readiness
/// over a cluster of skills, mixing three moves (requirement: diagnostic
/// checkpoints after clusters of skills; adapt tasks to readiness up and down;
/// planned revisits in a fresh story):
///
///  - low readiness (unseen/emerging) → a fresh DRILL of the skill's template
///    (a newly drawn problem, never a copied lesson step);
///  - developing → REUSE an already-authored item for the skill, presented
///    through a different lens than first seen (the revisit engine);
///  - secure → one TRANSFER item, not more repetition.
///
/// The result is an ordinary [LearnExperience], so the existing runner renders
/// it with zero new screen code.
library;

import 'learn_models.dart';
import 'readiness_logic.dart';

/// The checkpoint (if any) that becomes due once [experienceId] is completed.
LearnCheckpoint? checkpointAfter(LearnPath path, String experienceId) {
  for (final c in path.checkpoints) {
    if (c.afterExperience == experienceId) return c;
  }
  return null;
}

/// Why a skill's task was chosen — drives the mix and is handy in tests.
enum CheckpointMove { drill, reuse, transfer }

/// The move the readiness level calls for.
CheckpointMove moveFor(ReadinessLevel level) => switch (level) {
      ReadinessLevel.unseen || ReadinessLevel.emerging => CheckpointMove.drill,
      ReadinessLevel.developing => CheckpointMove.reuse,
      ReadinessLevel.secure => CheckpointMove.transfer,
    };

/// A small deterministic PRNG so a checkpoint is reproducible within a session
/// and in tests (never `dart:math`'s global Random).
int _next(int seed) => (seed * 1103515245 + 12345) & 0x7fffffff;
int _draw(int lo, int hi, int seed) => lo + (seed % (hi - lo + 1));

/// Builds the synthetic checkpoint experience. [lens] is the learner's CURRENT
/// context; reuse items are deliberately presented outside the lens they were
/// first met in (revisit = same skill, new frame). Deterministic given [seed].
LearnExperience buildCheckpointExperience(
  LearnCheckpoint checkpoint,
  LearnCatalog catalog,
  LearnPath path,
  Map<String, Readiness> skillReadiness, {
  int seed = 1,
}) {
  final steps = <LearnStep>[
    LearnStep(
      kind: LearnStepKind.scene,
      emoji: '🎯',
      title: 'محطة تحقّق',
      body: 'أسئلة قصيرة تكشف أين وصلت في هذه المهارات — لا جديد، فقط ما تدرّبت عليه.',
    ),
  ];

  var s = _next(seed);
  for (final skillId in checkpoint.skills) {
    final skill = catalog.skills[skillId];
    if (skill == null) continue;
    final level = skillReadiness[skillId]?.level ?? ReadinessLevel.unseen;
    final move = moveFor(level);

    LearnStep? step;
    if (move == CheckpointMove.drill && skill.drill != null) {
      s = _next(s);
      step = _drillStep(skill, s);
    }
    // Fall back to a reused authored item when there is no drill template, or
    // for the developing/secure moves.
    step ??= _reuseStep(skillId, path);
    // Last resort: if nothing authored exists either, a drill if possible.
    if (step == null && skill.drill != null) {
      s = _next(s);
      step = _drillStep(skill, s);
    }
    if (step != null) steps.add(step);
  }

  return LearnExperience(
    id: checkpoint.id,
    title: 'محطة تحقّق',
    subtitle: 'تشخيص المهارات',
    ready: true,
    steps: steps,
  );
}

/// A challenge step wrapping a freshly drawn drill instance. The draw is
/// solution-first so the instance is always valid and integer-solvable.
LearnStep? _drillStep(LearnSkill skill, int seed) {
  final drill = skill.drill!;
  int rng = seed;
  int drawRange(String key, int fallbackLo, int fallbackHi) {
    final r = drill.paramRanges[key];
    final lo = r != null && r.isNotEmpty ? r[0] : fallbackLo;
    final hi = r != null && r.length > 1 ? r[1] : fallbackHi;
    rng = _next(rng);
    return _draw(lo, hi, rng);
  }

  final params = <String, dynamic>{...drill.fixed};
  switch (drill.type) {
    case 'balance_scale':
      final coefficient = drawRange('coefficient', 1, 1);
      final constant = drawRange('constant', 1, 9);
      final solution = drawRange('solution', 1, 10);
      params['coefficient'] = coefficient;
      params['constant'] = constant;
      params['target'] = coefficient * solution + constant; // guaranteed solvable
      params.putIfAbsent('min', () => 0);
      params.putIfAbsent('max', () => coefficient * solution + constant);
      params.putIfAbsent('step', () => 1);
    case 'triangle_area':
      final base = drawRange('base', 3, 8);
      final height = drawRange('height', 3, 8);
      params['base'] = base;
      params['height'] = height;
      params['targetArea'] = (base * height) / 2; // achievable by construction
      params.putIfAbsent('maxDim', () => 12);
    default:
      return null;
  }

  return LearnStep(
    kind: LearnStepKind.challenge,
    title: skill.title,
    body: 'طبّق ما تعلّمته على مسألة جديدة.',
    skills: [skill.id],
    widget: LearnWidgetSpec(type: drill.type, params: params),
    successText: 'أحسنت — هذا يؤكد أنك أتقنت هذه المهارة.',
  );
}

/// A check step re-asking one already-authored item tagged with [skillId],
/// found anywhere in the path. Returns null when nothing is authored for it.
LearnStep? _reuseStep(String skillId, LearnPath path) {
  final item = _findAuthoredItem(skillId, path);
  if (item == null) return null;
  return LearnStep(
    kind: LearnStepKind.check,
    title: 'تحقّق',
    body: '',
    skills: [skillId],
    checkItems: [item],
  );
}

/// The first check item or choice tagged with [skillId] in [path]. Check items
/// inherit their step's skills when they carry none of their own.
LearnChoice? _findAuthoredItem(String skillId, LearnPath path) {
  for (final exp in path.experiences) {
    for (final step in exp.steps) {
      for (final item in step.checkItems) {
        final skills = item.skills.isNotEmpty ? item.skills : step.skills;
        if (skills.contains(skillId)) return item;
      }
      final choice = step.choice;
      if (choice != null && step.skills.contains(skillId)) return choice;
    }
  }
  return null;
}
