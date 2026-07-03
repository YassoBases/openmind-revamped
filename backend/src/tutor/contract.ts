/**
 * Tutor contract — the structured learning response OpenMind returns instead
 * of free-form chat. The LLM is schema-constrained to TutorReplySchema (same
 * structured-outputs path as spec generation); Flutter renders the fields it
 * knows and ignores the rest, so the contract can grow without breaking
 * clients. The model never produces UI instructions or code — only content.
 */
import { z } from 'zod';
import { sanitizeForClaude } from '@edumind/shared';

export const TUTOR_RESPONSE_TYPES = [
  'explanation',
  'hint',
  'question',
  'encouragement',
  'correction',
  'next_step',
] as const;

export const TUTOR_SUGGESTED_ACTIONS = [
  'none',
  'try_again',
  'show_hint',
  'real_life_example',
  'open_related_experience',
  'ask_followup',
] as const;

/** What the LLM generates (validated before anything reaches a student). */
export const TutorReplySchema = z.object({
  message: z.string().min(1).max(1200),
  responseType: z.enum(TUTOR_RESPONSE_TYPES),
  /** One short question that keeps the student thinking; null when message ends naturally. */
  followUpQuestion: z.string().max(300).nullable(),
  suggestedAction: z.enum(TUTOR_SUGGESTED_ACTIONS),
  /** Curriculum concept the reply centers on, e.g. "مساحة المثلث". */
  relatedConcept: z.string().max(80).nullable(),
  /** True when the tutor needs more information before it can help properly. */
  needsClarification: z.boolean(),
});
export type TutorReply = z.infer<typeof TutorReplySchema>;

export function tutorReplyJsonSchema(): Record<string, unknown> {
  const json = z.toJSONSchema(TutorReplySchema, { target: 'draft-2020-12', io: 'output' }) as Record<string, unknown>;
  delete json.$schema;
  return sanitizeForClaude(json) as Record<string, unknown>;
}

/**
 * Learning context the CLIENT may attach. Everything is optional — the "Ask
 * OpenMind" page sends little, the in-experience help button sends a lot.
 * Identity (grade, language, name) always comes from the authenticated
 * student row, never from here.
 */
export const TutorContextSchema = z.object({
  source: z.enum(['ask', 'experience']).default('ask'),
  subject: z.string().max(80).optional(),
  pathId: z.string().max(80).optional(),
  pathTitle: z.string().max(160).optional(),
  experienceId: z.string().max(80).optional(),
  experienceTitle: z.string().max(160).optional(),
  concept: z.string().max(120).optional(),
  stepKind: z.string().max(40).optional(),
  stepTitle: z.string().max(200).optional(),
  /** Live interaction state, e.g. "القاعدة=6، الارتفاع=4، المساحة=12 — الهدف 24". */
  state: z.string().max(400).optional(),
  /** What the student already tried (wrong options picked, previous shapes…). */
  attempts: z.array(z.string().max(200)).max(10).optional(),
  /** Ids of experiences the student completed (personalization signal). */
  completedExperiences: z.array(z.string().max(120)).max(50).optional(),
});
export type TutorContext = z.infer<typeof TutorContextSchema>;
