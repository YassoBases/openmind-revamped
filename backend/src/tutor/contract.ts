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

/**
 * Approved interactive block registry (Ask → See → Try). The model may only
 * SELECT one of these types and fill its data; it can never emit code, markup
 * or free-form UI. Flutter renders types it knows through its own registry
 * and ignores anything else, so both sides stay closed-world.
 *
 *  - number_line:    place a value on a bounded number line (math)
 *  - order_sequence: arrange items into the correct order (science/social/language)
 *  - sort_buckets:   classify items into labeled groups (language/science)
 */
export const INTERACTIVE_BLOCK_TYPES = ['number_line', 'order_sequence', 'sort_buckets'] as const;
export type InteractiveBlockType = (typeof INTERACTIVE_BLOCK_TYPES)[number];

/** Bump when a block's data shape changes incompatibly. */
export const INTERACTIVE_REGISTRY_VERSION = 1;

const InteractiveItemSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  /** sort_buckets: id of the bucket this item truly belongs to; null otherwise. */
  bucketId: z.string().max(40).nullable(),
});

const InteractiveBucketSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
});

/**
 * One flat data object for every block type (structured outputs handle flat
 * optionals far more reliably than unions). Which fields matter depends on
 * `type`; validateInteractivePayload enforces the per-type semantics.
 */
const InteractiveDataSchema = z.object({
  /** number_line: line bounds, movement step, the value to place, and the accepted tolerance. */
  min: z.number().nullable(),
  max: z.number().nullable(),
  step: z.number().nullable(),
  target: z.number().nullable(),
  tolerance: z.number().nullable(),
  /** number_line: short unit/axis label, e.g. "كغ" or "على المستقيم من 0 إلى 1". */
  unit: z.string().max(60).nullable(),
  /** order_sequence + sort_buckets: the manipulable items (3-8). */
  items: z.array(InteractiveItemSchema).max(8).nullable(),
  /** order_sequence: item ids in the correct order (a permutation of items). */
  correctOrder: z.array(z.string().max(40)).max(8).nullable(),
  /** sort_buckets: the groups (2-4). */
  buckets: z.array(InteractiveBucketSchema).max(4).nullable(),
});

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
  if (p.version !== INTERACTIVE_REGISTRY_VERSION) return null;
  const d = p.data;
  switch (p.type) {
    case 'number_line': {
      const { min, max, step, target } = d;
      if (min == null || max == null || step == null || target == null) return null;
      if (![min, max, step, target].every(Number.isFinite)) return null;
      if (min >= max || step <= 0) return null;
      if ((max - min) / step > 200) return null; // keep the line manipulable
      if (target < min || target > max) return null;
      if (d.tolerance != null && (!Number.isFinite(d.tolerance) || d.tolerance < 0)) return null;
      return p;
    }
    case 'order_sequence': {
      const items = d.items ?? [];
      const order = d.correctOrder ?? [];
      if (items.length < 3 || items.length > 8) return null;
      const ids = new Set(items.map((i) => i.id));
      if (ids.size !== items.length) return null;
      if (order.length !== items.length || new Set(order).size !== order.length) return null;
      if (!order.every((id) => ids.has(id))) return null;
      return p;
    }
    case 'sort_buckets': {
      const items = d.items ?? [];
      const buckets = d.buckets ?? [];
      if (buckets.length < 2 || buckets.length > 4) return null;
      const bucketIds = new Set(buckets.map((b) => b.id));
      if (bucketIds.size !== buckets.length) return null;
      if (items.length < 3 || items.length > 8) return null;
      if (new Set(items.map((i) => i.id)).size !== items.length) return null;
      if (!items.every((i) => i.bucketId != null && bucketIds.has(i.bucketId))) return null;
      return p;
    }
  }
}

/**
 * What the CLIENT reports after the learner acted on a block. Travels inside
 * the normal tutor message body so the follow-up is a real conversation turn.
 */
export const InteractiveResultSchema = z.object({
  blockType: z.enum(INTERACTIVE_BLOCK_TYPES),
  attempted: z.boolean(),
  /** Compact human-readable action state, e.g. "رتبت: تبخر → تكاثف → هطول". */
  answerOrState: z.string().max(500),
  correctnessOrOutcome: z.enum(['correct', 'partially_correct', 'incorrect', 'explored']),
  /** Optional extra pedagogy signal, e.g. "أخطأ في موضع التكاثف مرتين". */
  learningSignal: z.string().max(300).optional(),
});
export type InteractiveResult = z.infer<typeof InteractiveResultSchema>;

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
