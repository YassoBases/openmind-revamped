/// Learning-engine models — the Dart twin of the bundled learning catalogs
/// in assets/learning/*.json.
///
/// Same doctrine as GameSpec: the engine (screens/widgets) is hand-built and
/// generic; every experience is DATA parsed from JSON. Adding a lesson means
/// adding JSON, never touching a screen. Content today is curated Arabic
/// middle-school math; the shape is subject-agnostic on purpose.
library;

import 'readiness_logic.dart' show kErrorPatterns;

/// One catalog file: a subject+grade bundle of learning paths.
class LearnCatalog {
  LearnCatalog({
    required this.language,
    required this.subject,
    required this.grade,
    required this.paths,
    this.skills = const {},
  });

  final String language;
  final String subject;
  final int grade;
  final List<LearnPath> paths;

  /// Micro-skill definitions, keyed by id. Steps reference them by tag;
  /// evidence and readiness are recorded against them. Optional — an
  /// untagged catalog keeps working unchanged.
  final Map<String, LearnSkill> skills;

  static LearnCatalog fromMap(Map<String, dynamic> m) => LearnCatalog(
        language: m['language'] as String,
        subject: m['subject'] as String,
        grade: (m['grade'] as num).toInt(),
        paths: (m['paths'] as List)
            .map((p) => LearnPath.fromMap(p as Map<String, dynamic>))
            .toList(),
        skills: {
          for (final s in (m['skills'] as List?) ?? const [])
            (s as Map)['id'] as String:
                LearnSkill.fromMap(s.cast<String, dynamic>()),
        },
      );
}

/// One micro-skill a catalog's steps can evidence. `conceptFamily` matches
/// the backend ToolDescriptor.conceptFamilies taxonomy — one shared layer,
/// not two. Prereqs order the journey's next-goal suggestion and let a
/// diagnosis ground support in the weakest prerequisite.
class LearnSkill {
  LearnSkill({
    required this.id,
    required this.title,
    required this.conceptFamily,
    this.prereqs = const [],
    this.drill,
  });

  final String id;
  final String title;
  final String conceptFamily;
  final List<String> prereqs;

  /// Optional template for generating a fresh practice instance of this skill
  /// in a checkpoint (a new drawn problem, never a copied lesson step).
  final LearnDrill? drill;

  static LearnSkill fromMap(Map<String, dynamic> m) => LearnSkill(
        id: m['id'] as String,
        title: m['title'] as String,
        conceptFamily: (m['conceptFamily'] as String?) ?? '',
        prereqs:
            ((m['prereqs'] as List?) ?? const []).map((p) => p as String).toList(),
        drill: m['drill'] == null
            ? null
            : LearnDrill.fromMap((m['drill'] as Map).cast<String, dynamic>()),
      );
}

/// A parameterized practice template: a widget [type], per-parameter integer
/// ranges to draw from, and fixed parameters shared by every instance. The
/// checkpoint engine draws one instance deterministically (seeded) so a drill
/// is reproducible in tests and stable across a session.
class LearnDrill {
  LearnDrill({required this.type, required this.paramRanges, required this.fixed});

  final String type;
  final Map<String, List<int>> paramRanges; // name → [min, max] inclusive
  final Map<String, dynamic> fixed;

  static LearnDrill fromMap(Map<String, dynamic> m) => LearnDrill(
        type: m['type'] as String,
        paramRanges: ((m['paramRanges'] as Map?) ?? const {}).map(
          (k, v) => MapEntry(
            k.toString(),
            [for (final n in (v as List)) (n as num).toInt()],
          ),
        ),
        fixed: ((m['fixed'] as Map?) ?? const {})
            .map((k, v) => MapEntry(k.toString(), v)),
      );
}

/// A themed journey of experiences (e.g. "planning the neighborhood").
class LearnPath {
  LearnPath({
    required this.id,
    required this.title,
    required this.tagline,
    required this.emoji,
    required this.colorHex,
    required this.experiences,
    this.checkpoints = const [],
    this.lifeConnection,
  });

  final String id;
  final String title;
  final String tagline;
  final String emoji;
  final String colorHex;
  final List<LearnExperience> experiences;

  /// One authored sentence naming how this path's discovered skills help in
  /// real life — planning, design, technology, engineering, or everyday
  /// problem solving. Shown by Hudhud once every ready station is complete
  /// (see PathScreen). Optional; a path without one just lists the skills.
  final String? lifeConnection;

  /// Diagnostic checkpoints after clusters of skills. Assembled at runtime from
  /// already-authored items (rendered through a fresh lens) plus generated
  /// drills for weak skills — never duplicated lesson content. Optional.
  final List<LearnCheckpoint> checkpoints;

  static LearnPath fromMap(Map<String, dynamic> m) => LearnPath(
        id: m['id'] as String,
        title: m['title'] as String,
        tagline: m['tagline'] as String,
        emoji: (m['emoji'] as String?) ?? '⭐',
        colorHex: (m['color'] as String?) ?? '#1CB0F6',
        experiences: (m['experiences'] as List)
            .map((e) => LearnExperience.fromMap(e as Map<String, dynamic>))
            .toList(),
        checkpoints: ((m['checkpoints'] as List?) ?? const [])
            .map((c) => LearnCheckpoint.fromMap((c as Map).cast<String, dynamic>()))
            .toList(),
        lifeConnection: m['lifeConnection'] as String?,
      );
}

/// A diagnostic checkpoint: after [afterExperience] is completed, verify the
/// cluster of [skills] and diagnose exactly where difficulty sits.
class LearnCheckpoint {
  LearnCheckpoint({required this.id, required this.afterExperience, required this.skills});

  final String id;
  final String afterExperience;
  final List<String> skills;

  static LearnCheckpoint fromMap(Map<String, dynamic> m) => LearnCheckpoint(
        id: m['id'] as String,
        afterExperience: (m['afterExperience'] as String?) ?? '',
        skills: ((m['skills'] as List?) ?? const []).map((s) => s as String).toList(),
      );
}

/// One interactive situation the student lives through, as an ordered list
/// of steps. `ready` experiences carry steps; `soon` ones are placeholders
/// that keep the path map honest about what is coming.
class LearnExperience {
  LearnExperience({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.ready,
    required this.steps,
    this.valueNote,
  });

  final String id;
  final String title;
  final String subtitle;
  final bool ready;
  final List<LearnStep> steps;

  /// One authored sentence naming what this station's skill is good for in
  /// real life — shown at station completion alongside the stars earned, so
  /// the takeaway is the value added, not only a number. Optional; a station
  /// without one simply shows the stars.
  final String? valueNote;

  static LearnExperience fromMap(Map<String, dynamic> m) => LearnExperience(
        id: m['id'] as String,
        title: m['title'] as String,
        subtitle: (m['subtitle'] as String?) ?? '',
        ready: (m['status'] as String? ?? 'soon') == 'ready',
        steps: ((m['steps'] as List?) ?? const [])
            .map((s) => LearnStep.fromMap(s as Map<String, dynamic>))
            .toList(),
        valueNote: m['valueNote'] as String?,
      );
}

/// The step kinds the engine understands. The arc is fixed by the pedagogy:
/// live the situation → act freely and observe → commit to a prediction →
/// solve under a real constraint → apply the discovered idea → verify the
/// understanding landed. The short explanation of the methodology is NOT a
/// step: it stays on-demand through the in-experience tutor help sheet.
enum LearnStepKind { scene, explore, choice, challenge, apply, check }

/// Optional context-lens overrides for one step's NARRATIVE fields. A variant
/// may reword the story (title/body/emoji/successText) for the learner's
/// chosen context — it can never carry a widget, choice, or kind, so the
/// concept, interaction mechanics, targets, and difficulty are identical by
/// construction across every lens.
class LearnStepVariant {
  LearnStepVariant({this.title, this.body, this.emoji, this.successText});

  final String? title;
  final String? body;
  final String? emoji;
  final String? successText;

  static LearnStepVariant fromMap(Map<String, dynamic> m) => LearnStepVariant(
        title: m['title'] as String?,
        body: m['body'] as String?,
        emoji: m['emoji'] as String?,
        successText: m['successText'] as String?,
      );
}

/// One screen of an experience. Which fields are used depends on [kind]:
///  - scene:     title/body (+emoji) — sets the situation, always passable
///  - explore:   free interaction with [widget], passable after any change
///  - choice:    [choice] must be answered (right or wrong — feedback teaches)
///  - challenge: [widget] with a target; passable only when the target holds
///  - apply:     fixed [widget] and/or [choice] tying the idea to real life
///  - check:     [checkItems] quick verification — passable once every item
///               is answered; correctness is recorded, never a gate
class LearnStep {
  LearnStep({
    required this.kind,
    required this.title,
    required this.body,
    this.emoji,
    this.widget,
    this.choice,
    this.checkItems = const [],
    this.successText,
    this.variants = const {},
    this.skills = const [],
    this.rep,
    this.hints = const [],
  });

  final LearnStepKind kind;
  final String title;
  final String body;
  final String? emoji;
  final LearnWidgetSpec? widget;
  final LearnChoice? choice;

  /// Micro-skill ids this step evidences (see LearnCatalog.skills). Optional;
  /// an untagged step simply records no evidence.
  final List<String> skills;

  /// Authored representation override; see [representation] for the default.
  final String? rep;

  /// Which representation the learner is working in — recorded on evidence
  /// so readiness is per skill × representation. Derived unless authored:
  /// a manipulative step is `manipulative`, everything else `verbal`.
  String get representation =>
      rep ?? (widget != null ? 'manipulative' : 'verbal');

  /// Evidence kind, derived from the pedagogical arc — never authored.
  String get evidenceKind => switch (kind) {
        LearnStepKind.scene || LearnStepKind.explore => 'exploration',
        LearnStepKind.choice => 'prediction',
        LearnStepKind.challenge => 'construction',
        LearnStepKind.apply => 'transfer',
        LearnStepKind.check => 'recall',
      };

  /// `check` items: 2-3 quick questions verifying the station's one idea.
  /// Reuses the LearnChoice shape. Deliberately outside the lens system —
  /// verification, like mechanics, is identical across every lens.
  final List<LearnChoice> checkItems;

  /// Shown when a challenge target is reached.
  final String? successText;

  /// The 3-level hint ladder for this step, authored in escalating order:
  /// [0] observation (point at what's on screen), [1] next-step (name the
  /// move without doing it), [2] a stronger scaffold — never the final
  /// answer. Empty when unauthored (the step shows no ladder; Ask Hudhud
  /// remains the only help). Deliberately outside the lens system: unlike
  /// the narrative, hint WORDING can stay identical across every context —
  /// only what it's pointing at ever needs to change, which the learner
  /// already sees on screen.
  final List<String> hints;

  /// Context-lens id → narrative overrides (see [LearnStepVariant]).
  final Map<String, LearnStepVariant> variants;

  LearnStepVariant? _variant(String? context) =>
      context == null ? null : variants[context];

  String titleFor(String? context) => _variant(context)?.title ?? title;
  String bodyFor(String? context) => _variant(context)?.body ?? body;
  String? emojiFor(String? context) => _variant(context)?.emoji ?? emoji;
  String? successTextFor(String? context) =>
      _variant(context)?.successText ?? successText;

  static LearnStep fromMap(Map<String, dynamic> m) => LearnStep(
        kind: LearnStepKind.values.byName(m['kind'] as String),
        title: m['title'] as String,
        body: (m['body'] as String?) ?? '',
        emoji: m['emoji'] as String?,
        widget: m['widget'] == null
            ? null
            : LearnWidgetSpec.fromMap(m['widget'] as Map<String, dynamic>),
        choice: m['choice'] == null
            ? null
            : LearnChoice.fromMap(m['choice'] as Map<String, dynamic>),
        checkItems: ((m['checkItems'] as List?) ?? const [])
            .map((c) => LearnChoice.fromMap((c as Map).cast<String, dynamic>()))
            .toList(),
        successText: m['successText'] as String?,
        variants: ((m['variants'] as Map?) ?? const {}).map(
          (k, v) => MapEntry(
            k.toString(),
            LearnStepVariant.fromMap((v as Map).cast<String, dynamic>()),
          ),
        ),
        skills:
            ((m['skills'] as List?) ?? const []).map((s) => s as String).toList(),
        rep: m['rep'] as String?,
        hints: ((m['hints'] as List?) ?? const []).map((h) => h as String).toList(),
      );
}

/// A parameterized interactive manipulative. `type` picks the builder from
/// the registry in widgets/learn_widget_registry.dart; `params` configures
/// it. New manipulatives = new type + builder, zero engine changes.
class LearnWidgetSpec {
  LearnWidgetSpec({required this.type, required this.params});

  final String type;
  final Map<String, dynamic> params;

  static LearnWidgetSpec fromMap(Map<String, dynamic> m) => LearnWidgetSpec(
        type: m['type'] as String,
        params: (m['params'] as Map?)?.map((k, v) => MapEntry(k.toString(), v)) ??
            <String, dynamic>{},
      );
}

/// A committed decision: options, one correct, feedback either way.
/// Feedback always explains — a wrong pick teaches instead of punishing.
class LearnChoice {
  LearnChoice({
    required this.prompt,
    required this.options,
    required this.correctIndex,
    required this.correctFeedback,
    required this.wrongFeedback,
    this.distractorPatterns = const [],
    this.skills = const [],
    this.rep,
  });

  final String prompt;
  final List<String> options;
  final int correctIndex;
  final String correctFeedback;
  final String wrongFeedback;

  /// Representation this item exercises (e.g. a symbolic check of a skill
  /// first met on the manipulative). Null = inherit the step's.
  final String? rep;

  /// Parallel to [options]: the error pattern each distractor was built
  /// around (null on the correct slot). Authors already explain the
  /// misconception in wrongFeedback — this names it so a wrong pick becomes
  /// a diagnosis instead of just "wrong". Optional.
  final List<String?> distractorPatterns;

  /// Check items may narrow the step's skill tags to their own — one check
  /// step can then cover a whole skill cluster. Empty = inherit the step's.
  final List<String> skills;

  /// The diagnosed error pattern for picking option [i], or null (correct
  /// pick, untagged option, or out of range — tags degrade to no diagnosis).
  String? patternFor(int i) {
    if (i == correctIndex || i < 0 || i >= distractorPatterns.length) {
      return null;
    }
    final p = distractorPatterns[i];
    // A typo'd tag in content degrades to "no diagnosis", never to a bogus
    // pattern.
    return kErrorPatterns.contains(p) ? p : null;
  }

  static LearnChoice fromMap(Map<String, dynamic> m) => LearnChoice(
        prompt: m['prompt'] as String,
        options: (m['options'] as List).map((o) => o as String).toList(),
        correctIndex: (m['correctIndex'] as num).toInt(),
        correctFeedback: (m['correctFeedback'] as String?) ?? '',
        wrongFeedback: (m['wrongFeedback'] as String?) ?? '',
        distractorPatterns: ((m['distractorPatterns'] as List?) ?? const [])
            .map((p) => p as String?)
            .toList(),
        skills:
            ((m['skills'] as List?) ?? const []).map((s) => s as String).toList(),
        rep: m['rep'] as String?,
      );
}
