/**
 * Error pattern → support action. The single mapping that turns a diagnosis
 * into a specific next move instead of a generic "try again". Consumed by the
 * lesson check footer, checkpoint follow-ups, and (via the prompt) Ask Hudhud.
 * Dart twin: edumind-ui/lib/features/learn/support_actions.dart — keep in sync.
 */
import type { ErrorPattern } from './evidence.js';

export type SupportAction =
  | 'revisit_explore' // reopen the concept's explore step / re-ground in the manipulative
  | 'switch_rep' // show the same task in the linked representation
  | 'unit_hint' // one targeted sentence about the unit, then retry
  | 'recheck' // "your idea is right, recheck the arithmetic" + free retry
  | 'step_scaffold' // walk exactly ONE step of the procedure
  | 'familiar_context_first'; // same skill in the learner's own lens, then retry the transfer

export const SUPPORT_BY_PATTERN: Record<ErrorPattern, SupportAction> = {
  concept_misunderstanding: 'revisit_explore',
  representation_confusion: 'switch_rep',
  wrong_unit: 'unit_hint',
  calculation_slip: 'recheck',
  procedural_error: 'step_scaffold',
  transfer_difficulty: 'familiar_context_first',
};

export function supportFor(pattern: ErrorPattern): SupportAction {
  return SUPPORT_BY_PATTERN[pattern];
}
