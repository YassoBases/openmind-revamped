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

/// One structured tutor reply.
class TutorReply {
  TutorReply({
    required this.message,
    required this.responseType,
    required this.followUpQuestion,
    required this.suggestedAction,
    required this.relatedConcept,
    required this.needsClarification,
  });

  final String message;
  final TutorResponseType responseType;
  final String? followUpQuestion;
  final TutorSuggestedAction suggestedAction;
  final String? relatedConcept;
  final bool needsClarification;

  static TutorReply fromMap(Map<String, dynamic> m) => TutorReply(
        message: m['message'] as String,
        responseType: _responseType(m['responseType'] as String?),
        followUpQuestion: m['followUpQuestion'] as String?,
        suggestedAction: _suggestedAction(m['suggestedAction'] as String?),
        relatedConcept: m['relatedConcept'] as String?,
        needsClarification: (m['needsClarification'] as bool?) ?? false,
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
