/// Tutor models — the Dart twin of the backend tutor contract
/// (backend/src/tutor/contract.ts). The backend returns a STRUCTURED
/// learning response, never free-form chat; the client decides how each
/// field renders. Unknown enum values degrade gracefully so the contract
/// can grow server-side without breaking older clients.
library;

import 'blocks/block_descriptors.dart';

/// What the tutor's message mainly is.
enum TutorResponseType { explanation, hint, question, encouragement, correction, nextStep, unknown }

/// What the tutor suggests the student does next.
enum TutorSuggestedAction { none, tryAgain, showHint, realLifeExample, openRelatedExperience, askFollowup, unknown }

TutorResponseType _responseType(String? v) => switch (v) {
      'explanation' => TutorResponseType.explanation,
      'hint' => TutorResponseType.hint,
      'question' => TutorResponseType.question,
      'encouragement' => TutorResponseType.encouragement,
      'correction' => TutorResponseType.correction,
      'next_step' => TutorResponseType.nextStep,
      _ => TutorResponseType.unknown,
    };

TutorSuggestedAction _suggestedAction(String? v) => switch (v) {
      'none' => TutorSuggestedAction.none,
      'try_again' => TutorSuggestedAction.tryAgain,
      'show_hint' => TutorSuggestedAction.showHint,
      'real_life_example' => TutorSuggestedAction.realLifeExample,
      'open_related_experience' => TutorSuggestedAction.openRelatedExperience,
      'ask_followup' => TutorSuggestedAction.askFollowup,
      _ => TutorSuggestedAction.unknown,
    };

// The approved block catalog is the Dart twin of the backend tool registry
// (backend/src/tutor/tools/): per-tool versions and render-safety checks live
// in blocks/block_descriptors.dart, widgets in blocks/tutor_block_registry.dart.
// The client renders ONLY types it knows and silently ignores anything else,
// so the closed world holds on both ends.

/// One manipulable item of an order/sort block.
class InteractiveItem {
  InteractiveItem({required this.id, required this.label, this.bucketId});

  final String id;
  final String label;

  /// sort_buckets: the bucket this item truly belongs to.
  final String? bucketId;
}

/// One group of a sort_buckets block.
class InteractiveBucket {
  InteractiveBucket({required this.id, required this.label});

  final String id;
  final String label;
}

/// One connection of a match_pairs block: [left] is the prompt side (word,
/// root, concept, event…), [right] its one true match.
class InteractivePair {
  InteractivePair({required this.id, required this.left, required this.right});

  final String id;
  final String left;
  final String right;
}

/// A validated Ask → See → Try block offered by the tutor. Parsing is
/// deliberately defensive: any structural surprise (unknown type, wrong
/// version, missing fields) yields null and the reply degrades to text —
/// the same honesty rule the backend applies.
class InteractivePayload {
  InteractivePayload._({
    required this.type,
    required this.title,
    required this.instructions,
    this.min,
    this.max,
    this.step,
    this.target,
    this.tolerance,
    this.unit,
    this.items = const [],
    this.correctOrder = const [],
    this.buckets = const [],
    this.pairs = const [],
    this.coefficient,
    this.constant,
  });

  final String type;
  final String title;
  final String instructions;

  // number_line + balance_scale
  final num? min;
  final num? max;
  final num? step;
  final num? target;
  final num? tolerance;
  final String? unit;

  // order_sequence + sort_buckets
  final List<InteractiveItem> items;
  final List<String> correctOrder;
  final List<InteractiveBucket> buckets;

  // match_pairs
  final List<InteractivePair> pairs;

  // balance_scale
  final num? coefficient;
  final num? constant;

  static InteractivePayload? fromMap(dynamic raw) {
    if (raw is! Map) return null;
    final m = raw.cast<String, dynamic>();
    final type = m['type'];
    if (type is! String) return null;
    final descriptor = kTutorBlockDescriptors[type];
    if (descriptor == null) return null;
    // Per-tool version: a mismatch invalidates this tool only, never the catalog.
    if ((m['version'] as num?)?.toInt() != descriptor.version) return null;
    final title = m['title'];
    final instructions = m['instructions'];
    if (title is! String || title.isEmpty) return null;
    if (instructions is! String || instructions.isEmpty) return null;
    final data = m['data'];
    final d = data is Map ? data.cast<String, dynamic>() : <String, dynamic>{};
    try {
      final payload = InteractivePayload._(
        type: type,
        title: title,
        instructions: instructions,
        min: d['min'] as num?,
        max: d['max'] as num?,
        step: d['step'] as num?,
        target: d['target'] as num?,
        tolerance: d['tolerance'] as num?,
        unit: d['unit'] as String?,
        items: [
          for (final i in (d['items'] as List? ?? const []))
            InteractiveItem(
              id: (i as Map)['id'] as String,
              label: i['label'] as String,
              bucketId: i['bucketId'] as String?,
            ),
        ],
        correctOrder: [
          for (final id in (d['correctOrder'] as List? ?? const [])) id as String,
        ],
        buckets: [
          for (final b in (d['buckets'] as List? ?? const []))
            InteractiveBucket(id: (b as Map)['id'] as String, label: b['label'] as String),
        ],
        pairs: [
          for (final x in (d['pairs'] as List? ?? const []))
            InteractivePair(
              id: (x as Map)['id'] as String,
              left: x['left'] as String,
              right: x['right'] as String,
            ),
        ],
        coefficient: d['coefficient'] as num?,
        constant: d['constant'] as num?,
      );
      // The tool's own render-safety check (blocks/block_descriptors.dart) —
      // the client-side twin of the server's semantic gate.
      return descriptor.renderable(payload) ? payload : null;
    } catch (_) {
      return null; // malformed data — degrade to text-only
    }
  }
}

/// What the learner's action amounted to.
enum InteractiveOutcome {
  correct('correct'),
  partiallyCorrect('partially_correct'),
  incorrect('incorrect'),
  explored('explored');

  const InteractiveOutcome(this.wire);
  final String wire;
}

/// The structured result a block reports back through the tutor flow.
///
/// [answer] is the machine-verifiable final submission (number_line: {value},
/// order_sequence: {order}, sort_buckets: {placements}, match_pairs:
/// {wrongTries}) — the backend recomputes correctness from it against the
/// original instance, so the outcome here is a claim the server checks, not
/// a verdict it trusts.
class InteractiveResult {
  InteractiveResult({
    required this.blockType,
    required this.attempted,
    required this.answerOrState,
    required this.outcome,
    this.answer,
    this.learningSignal,
  });

  final String blockType;
  final bool attempted;
  final String answerOrState;
  final InteractiveOutcome outcome;
  final Map<String, dynamic>? answer;
  final String? learningSignal;

  Map<String, dynamic> toMap() => {
        'blockType': blockType,
        'attempted': attempted,
        'answerOrState': answerOrState,
        'correctnessOrOutcome': outcome.wire,
        if (answer != null) 'answer': answer,
        if (learningSignal != null) 'learningSignal': learningSignal,
      };
}

/// One structured tutor reply.
class TutorReply {
  TutorReply({
    required this.message,
    required this.responseType,
    required this.followUpQuestion,
    required this.suggestedAction,
    required this.relatedConcept,
    required this.needsClarification,
    this.interactivePayload,
  });

  final String message;
  final TutorResponseType responseType;
  final String? followUpQuestion;
  final TutorSuggestedAction suggestedAction;
  final String? relatedConcept;
  final bool needsClarification;

  /// Ask → See → Try block, or null for a text-only reply.
  final InteractivePayload? interactivePayload;

  static TutorReply fromMap(Map<String, dynamic> m) => TutorReply(
        message: m['message'] as String,
        responseType: _responseType(m['responseType'] as String?),
        followUpQuestion: m['followUpQuestion'] as String?,
        suggestedAction: _suggestedAction(m['suggestedAction'] as String?),
        relatedConcept: m['relatedConcept'] as String?,
        needsClarification: (m['needsClarification'] as bool?) ?? false,
        interactivePayload: InteractivePayload.fromMap(m['interactivePayload']),
      );
}

/// The full POST /tutor/messages response.
class TutorAskResult {
  TutorAskResult({required this.conversationId, required this.reply});

  final String conversationId;
  final TutorReply reply;

  static TutorAskResult fromMap(Map<String, dynamic> m) => TutorAskResult(
        conversationId: m['conversationId'] as String,
        reply: TutorReply.fromMap(m['reply'] as Map<String, dynamic>),
      );
}

/// Learning context the client attaches to a question. The "Ask" page sends
/// little; the in-experience help button fills everything it knows. Identity
/// (grade, language) is NOT here — the backend takes it from the token.
class TutorContext {
  TutorContext({
    required this.source,
    this.subject,
    this.pathId,
    this.pathTitle,
    this.experienceId,
    this.experienceTitle,
    this.concept,
    this.stepKind,
    this.stepTitle,
    this.state,
    this.attempts = const [],
    this.completedExperiences = const [],
    this.skills = const [],
    this.readiness = const [],
  });

  final String source; // 'ask' | 'experience'
  final String? subject;
  final String? pathId;
  final String? pathTitle;
  final String? experienceId;
  final String? experienceTitle;
  final String? concept;
  final String? stepKind;
  final String? stepTitle;
  final String? state;
  final List<String> attempts;
  final List<String> completedExperiences;

  /// Micro-skill ids the current step evidences — what Hudhud should ground a
  /// hint in.
  final List<String> skills;

  /// A compact readiness slice for this experience's skills (+ prereqs), each
  /// {skill, rep, level, recentErrorPatterns}. Lets Hudhud respond to the
  /// diagnosed pattern and start from the weakest prerequisite, never a
  /// generic hint. Kept small (≤ ~8 entries).
  final List<Map<String, dynamic>> readiness;

  Map<String, dynamic> toMap() => {
        'source': source,
        if (subject != null) 'subject': subject,
        if (pathId != null) 'pathId': pathId,
        if (pathTitle != null) 'pathTitle': pathTitle,
        if (experienceId != null) 'experienceId': experienceId,
        if (experienceTitle != null) 'experienceTitle': experienceTitle,
        if (concept != null) 'concept': concept,
        if (stepKind != null) 'stepKind': stepKind,
        if (stepTitle != null) 'stepTitle': stepTitle,
        if (state != null) 'state': state,
        if (attempts.isNotEmpty) 'attempts': attempts,
        if (completedExperiences.isNotEmpty) 'completedExperiences': completedExperiences,
        if (skills.isNotEmpty) 'skills': skills,
        if (readiness.isNotEmpty) 'readiness': readiness,
      };
}
