/// Learning-engine models — the Dart twin of the bundled learning catalogs
/// in assets/learning/*.json.
///
/// Same doctrine as GameSpec: the engine (screens/widgets) is hand-built and
/// generic; every experience is DATA parsed from JSON. Adding a lesson means
/// adding JSON, never touching a screen. Content today is curated Arabic
/// middle-school math; the shape is subject-agnostic on purpose.
library;

/// One catalog file: a subject+grade bundle of learning paths.
class LearnCatalog {
  LearnCatalog({
    required this.language,
    required this.subject,
    required this.grade,
    required this.paths,
  });

  final String language;
  final String subject;
  final int grade;
  final List<LearnPath> paths;

  static LearnCatalog fromMap(Map<String, dynamic> m) => LearnCatalog(
        language: m['language'] as String,
        subject: m['subject'] as String,
        grade: (m['grade'] as num).toInt(),
        paths: (m['paths'] as List)
            .map((p) => LearnPath.fromMap(p as Map<String, dynamic>))
            .toList(),
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
  });

  final String id;
  final String title;
  final String tagline;
  final String emoji;
  final String colorHex;
  final List<LearnExperience> experiences;

  static LearnPath fromMap(Map<String, dynamic> m) => LearnPath(
        id: m['id'] as String,
        title: m['title'] as String,
        tagline: m['tagline'] as String,
        emoji: (m['emoji'] as String?) ?? '⭐',
        colorHex: (m['color'] as String?) ?? '#1CB0F6',
        experiences: (m['experiences'] as List)
            .map((e) => LearnExperience.fromMap(e as Map<String, dynamic>))
            .toList(),
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
  });

  final String id;
  final String title;
  final String subtitle;
  final bool ready;
  final List<LearnStep> steps;

  static LearnExperience fromMap(Map<String, dynamic> m) => LearnExperience(
        id: m['id'] as String,
        title: m['title'] as String,
        subtitle: (m['subtitle'] as String?) ?? '',
        ready: (m['status'] as String? ?? 'soon') == 'ready',
        steps: ((m['steps'] as List?) ?? const [])
            .map((s) => LearnStep.fromMap(s as Map<String, dynamic>))
            .toList(),
      );
}

/// The step kinds the engine understands. The arc is fixed by the pedagogy:
/// live the situation → act freely and observe → commit to a prediction →
/// solve under a real constraint → apply the discovered idea.
enum LearnStepKind { scene, explore, choice, challenge, apply }

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
class LearnStep {
  LearnStep({
    required this.kind,
    required this.title,
    required this.body,
    this.emoji,
    this.widget,
    this.choice,
    this.successText,
    this.variants = const {},
  });

  final LearnStepKind kind;
  final String title;
  final String body;
  final String? emoji;
  final LearnWidgetSpec? widget;
  final LearnChoice? choice;

  /// Shown when a challenge target is reached.
  final String? successText;

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
        successText: m['successText'] as String?,
        variants: ((m['variants'] as Map?) ?? const {}).map(
          (k, v) => MapEntry(
            k.toString(),
            LearnStepVariant.fromMap((v as Map).cast<String, dynamic>()),
          ),
        ),
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
  });

  final String prompt;
  final List<String> options;
  final int correctIndex;
  final String correctFeedback;
  final String wrongFeedback;

  static LearnChoice fromMap(Map<String, dynamic> m) => LearnChoice(
        prompt: m['prompt'] as String,
        options: (m['options'] as List).map((o) => o as String).toList(),
        correctIndex: (m['correctIndex'] as num).toInt(),
        correctFeedback: (m['correctFeedback'] as String?) ?? '',
        wrongFeedback: (m['wrongFeedback'] as String?) ?? '',
      );
}
