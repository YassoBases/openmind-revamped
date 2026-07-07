/// Error pattern → support action → learner-facing guidance. The Dart twin of
/// backend/src/learning/support.ts: one mapping that turns a diagnosis into a
/// specific next move instead of a generic "try again" (requirement: each
/// error pattern maps to a specific support action). Consumed by the lesson
/// check footer today; checkpoint follow-ups and Hudhud reuse the same table.
library;

/// The concrete next move for a diagnosed error.
enum SupportAction {
  revisitExplore, // re-ground the idea in the manipulative
  switchRep, // show the same task in another representation
  unitHint, // one targeted sentence about the unit, then retry
  recheck, // "your idea is right, recheck the arithmetic"
  stepScaffold, // walk exactly one step of the procedure
  familiarContextFirst, // same skill in a familiar story, then retry the transfer
}

/// Maps an error-pattern tag (see readiness_logic.kErrorPatterns) to its
/// support action. Unknown/absent tags return null — no diagnosis, no claim.
SupportAction? supportForPattern(String? pattern) => switch (pattern) {
      'concept_misunderstanding' => SupportAction.revisitExplore,
      'representation_confusion' => SupportAction.switchRep,
      'wrong_unit' => SupportAction.unitHint,
      'calculation_slip' => SupportAction.recheck,
      'procedural_error' => SupportAction.stepScaffold,
      'transfer_difficulty' => SupportAction.familiarContextFirst,
      _ => null,
    };

/// The localization key for a support action's short learner-facing message.
String supportMessageKey(SupportAction action) => switch (action) {
      SupportAction.revisitExplore => 'support_revisit_explore',
      SupportAction.switchRep => 'support_switch_rep',
      SupportAction.unitHint => 'support_unit_hint',
      SupportAction.recheck => 'support_recheck',
      SupportAction.stepScaffold => 'support_step_scaffold',
      SupportAction.familiarContextFirst => 'support_familiar_context_first',
    };
