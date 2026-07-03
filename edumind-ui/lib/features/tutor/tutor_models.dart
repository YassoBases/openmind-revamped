/// Tutor models — the Dart twin of the backend tutor contract
/// (backend/src/tutor/contract.ts). The backend returns a STRUCTURED
/// learning response, never free-form chat; the client decides how each
/// field renders. Unknown enum values degrade gracefully so the contract
/// can grow server-side without breaking older clients.
library;

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

/// Approved interactive block registry, version 1 — the Dart twin of
/// INTERACTIVE_BLOCK_TYPES in backend/src/tutor/contract.ts. The client
/// renders ONLY types it knows (see blocks/tutor_block_registry.dart);
/// anything else is silently ignored, so the closed world holds on both ends.
const int kInteractiveRegistryVersion = 1;
const List<String> kInteractiveBlockTypes = [
  'number_line',
  'order_sequence',
  'sort_buckets',
];

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
  });

  final String type;
  final String title;
  final String instructions;

  // number_line
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

  static InteractivePayload? fromMap(dynamic raw) {
    if (raw is! Map) return null;
    final m = raw.cast<String, dynamic>();
    final type = m['type'];
    if (type is! String || !kInteractiveBlockTypes.contains(type)) return null;
    if ((m['version'] as num?)?.toInt() != kInteractiveRegistryVersion) return null;
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
      );
      return payload._renderable ? payload : null;
    } catch (_) {
      return null; // malformed data — degrade to text-only
    }
  }

  /// Client-side twin of the server's semantic gate (belt and braces).
  bool get _renderable => switch (type) {
        'number_line' => min != null &&
            max != null &&
            step != null &&
            target != null &&
            min! < max! &&
            step! > 0 &&
            target! >= min! &&
            target! <= max!,
        'order_sequence' => items.length >= 3 &&
            correctOrder.length == items.length &&
            items.map((i) => i.id).toSet().containsAll(correctOrder) &&
            correctOrder.toSet().length == correctOrder.length,
        'sort_buckets' => buckets.length >= 2 &&
            items.length >= 3 &&
            items.every((i) => buckets.any((b) => b.id == i.bucketId)),
        _ => false,
      };
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
class InteractiveResult {
  InteractiveResult({
    required this.blockType,
    required this.attempted,
    required this.answerOrState,
    required this.outcome,
    this.learningSignal,
  });

  final String blockType;
  final bool attempted;
  final String answerOrState;
  final InteractiveOutcome outcome;
  final String? learningSignal;

  Map<String, dynamic> toMap() => {
        'blockType': blockType,
        'attempted': attempted,
        'answerOrState': answerOrState,
        'correctnessOrOutcome': outcome.wire,
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
      };
}
