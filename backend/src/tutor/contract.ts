/**
 * Tutor contract — the structured learning response OpenMind returns instead
 * of free-form chat. The LLM is schema-constrained to TutorReplySchema (same
 * structured-outputs path as spec generation); Flutter renders the fields it
 * knows and ignores the rest, so the contract can grow without breaking
 * clients. The model never produces UI instructions or code — only content.
 */
import { z } from 'zod';
import { sanitizeForClaude } from '@edumind/shared';
import { INTERACTIVE_BLOCK_TYPES, getTool, mergedDataFields } from './tools/registry.js';
import { ResultAnswerSchema, type ToolDataView } from './tools/types.js';

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

/**
 * Approved interactive block registry (Ask → See → Try). The model may only
 * SELECT one of these types and fill its data; it can never emit code, markup
 * or free-form UI. Flutter renders types it knows through its own registry
 * and ignores anything else, so both sides stay closed-world. The catalog
 * itself lives in ./tools/ — one ToolDescriptor per family; this contract is
 * DERIVED from it (type enum, flat data fields, semantic gate).
 */
export { INTERACTIVE_BLOCK_TYPES };
export type InteractiveBlockType = (typeof INTERACTIVE_BLOCK_TYPES)[number];

/**
 * One flat data object for every block type (structured outputs handle flat
 * optionals far more reliably than unions) — the merge of every registered
 * tool's declared dataFields. Which fields matter depends on `type`;
 * validateInteractivePayload enforces the per-tool semantics.
 */
const InteractiveDataSchema = z.object(mergedDataFields());

export const InteractivePayloadSchema = z.object({
  type: z.enum(INTERACTIVE_BLOCK_TYPES),
  version: z.number().int(),
  title: z.string().min(1).max(120),
  instructions: z.string().min(1).max(300),
  data: InteractiveDataSchema,
  /** What acting should teach, e.g. "يرتب مراحل دورة الماء بنفسه". */
  expectedLearningAction: z.string().max(200),
  /** How the tutor plans to follow up once the learner's result comes back. */
  followUpPrompt: z.string().max(300),
});
export type InteractivePayload = z.infer<typeof InteractivePayloadSchema>;

/**
 * Semantic gate on top of the structural schema — runs server-side after the
 * LLM call. Returns the payload when it is genuinely renderable, else null
 * (the reply text still ships; the client simply gets no block). This is the
 * honesty rule in code: a broken activity is never pretended into existence.
 */
export function validateInteractivePayload(p: InteractivePayload): InteractivePayload | null {
  const tool = getTool(p.type);
  if (!tool || !tool.available) return null;
  // Per-tool versioning: a mismatch invalidates THIS tool only, never the catalog.
  if (p.version !== tool.version) return null;
  return tool.validate(p.data as unknown as ToolDataView) ? p : null;
}

/**
 * What the CLIENT reports after the learner acted on a block. Travels inside
 * the normal tutor message body so the follow-up is a real conversation turn.
 *
 * TRUST MODEL: correctnessOrOutcome is a CLAIM, never taken at face value.
 * When `answer` (the structured final submission) is present, the route
 * recomputes the outcome server-side against the ORIGINAL stored instance
 * (tutor/result.ts) and overrides a wrong claim; without it (older clients)
 * the claim is used but flagged client_reported in the learning signal.
 */
export const InteractiveResultSchema = z.object({
  blockType: z.enum(INTERACTIVE_BLOCK_TYPES),
  attempted: z.boolean(),
  /** Compact human-readable action state, e.g. "رتبت: تبخر → تكاثف → هطول". */
  answerOrState: z.string().max(500),
  correctnessOrOutcome: z.enum(['correct', 'partially_correct', 'incorrect', 'explored']),
  /** The machine-verifiable final submission (see tools/types.ts). */
  answer: ResultAnswerSchema.optional(),
  /** Optional extra pedagogy signal, e.g. "أخطأ في موضع التكاثف مرتين". */
  learningSignal: z.string().max(300).optional(),
});
export type InteractiveResult = z.infer<typeof InteractiveResultSchema>;

/**
 * Interaction-mechanic taxonomy for the honest-fallback channel. When acting
 * WOULD teach better than reading but NO registered tool can render the
 * concept, the model names the mechanic it wishes existed instead of forcing a
 * bad fit. The first row are mechanics the registry already covers (naming one
 * here flags a SELECTION gap — a fit should have produced a real payload); the
 * rest are the platform's growth edge (nothing renders them yet). 'other' is
 * the escape hatch. This never becomes a broken activity — it is a
 * prioritization signal, logged and counted server-side (routes/tutor.ts), so
 * the tool library grows toward real demand rather than guesswork.
 */
export const INTERACTION_MECHANICS = [
  // Already have renderers (mirror the registry's Primitive taxonomy):
  'place_on_scale', 'order', 'classify', 'match', 'compose', 'adjust_observe', 'decide',
  // Not supported yet — the growth edge:
  'simulate', 'plot_graph', 'draw_annotate', 'locate_map', 'build_expression', 'other',
] as const;
export type InteractionMechanic = (typeof INTERACTION_MECHANICS)[number];

export const SuggestedInteractionSchema = z.object({
  /** The interaction mechanic that would teach this concept best. */
  mechanic: z.enum(INTERACTION_MECHANICS),
  /** One line on why DOING would beat reading here — the demand, in plain words. */
  reason: z.string().min(1).max(240),
  /** The curriculum concept it would serve, e.g. "قراءة رسم بياني خطي", or null. */
  conceptFamily: z.string().max(80).nullable(),
});
export type SuggestedInteraction = z.infer<typeof SuggestedInteractionSchema>;

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
  /** Ask → See → Try: an approved interactive block, or null for text-only. */
  interactivePayload: InteractivePayloadSchema.nullable(),
  /**
   * Honest fallback: when an interactive activity WOULD help but no registered
   * tool can render the concept, the model sets interactivePayload to null and
   * names the missing interaction here (for future-renderer prioritization).
   * Null in every other case — including when a tool DID fit (that produces
   * interactivePayload), or when plain explanation was the right response.
   */
  suggestedInteraction: SuggestedInteractionSchema.nullable(),
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
  /** Micro-skill ids the current step evidences — what to ground a hint in. */
  skills: z.array(z.string().max(80)).max(10).optional(),
  /**
   * Compact per-skill readiness for this experience (+ prereqs): where the
   * learner is on each micro-skill and the error patterns recently diagnosed,
   * so the hint answers the pattern and starts from the weakest prerequisite.
   */
  readiness: z
    .array(
      z.object({
        skill: z.string().max(80),
        rep: z.string().max(20),
        level: z.string().max(20),
        recentErrorPatterns: z.array(z.string().max(40)).max(5).optional(),
      }),
    )
    .max(12)
    .optional(),
});
export type TutorContext = z.infer<typeof TutorContextSchema>;
