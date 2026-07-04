/**
 * ToolDescriptor — the registry contract of the Interactive Learning
 * Capability Platform (docs/INTERACTIVE_PLATFORM.md §3). Every approved tool
 * family registers ONE descriptor; the registry derives everything else from
 * it: the structural schema fields, the prompt section, server-side
 * eligibility, the semantic gate, and the mock's golden examples. The model
 * never generates UI or code — it selects a descriptor's id and fills its
 * declared data.
 */
import { z } from 'zod';
import type { LearningStage } from '../../learning/stage.js';

/** Taxonomy layer 1 — the interaction mechanic (cross-subject by nature). */
export type Primitive =
  | 'place_on_scale'
  | 'order'
  | 'classify'
  | 'match'
  | 'compose'
  | 'adjust_observe'
  | 'decide';

/** Curriculum subjects the platform grows across. '*' = reusable as-is. */
export const SUBJECTS = [
  'math',
  'science',
  'arabic',
  'english',
  'social_studies',
  'geography',
  'future_skills',
] as const;
export type Subject = (typeof SUBJECTS)[number];

/**
 * The flat data view every semantic validator receives (the union of all
 * registered tools' fields, each null when unused — structured outputs handle
 * flat optionals far better than unions). A tool declares WHICH keys it owns
 * via `dataFields`; the registry merges them into the structural schema.
 */
export interface ToolDataView {
  min: number | null;
  max: number | null;
  step: number | null;
  target: number | null;
  tolerance: number | null;
  unit: string | null;
  items: Array<{ id: string; label: string; bucketId: string | null }> | null;
  correctOrder: string[] | null;
  buckets: Array<{ id: string; label: string }> | null;
  pairs: Array<{ id: string; left: string; right: string }> | null;
}

/**
 * Shared field schemas — tools that use the same key MUST reference the same
 * schema object (the registry asserts reference equality when merging, so two
 * tools can never silently disagree about a shared field's shape).
 */
export const InteractiveItemSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  /** sort_buckets: id of the bucket this item truly belongs to; null otherwise. */
  bucketId: z.string().max(40).nullable(),
});

export const InteractiveBucketSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
});

export const InteractivePairSchema = z.object({
  id: z.string().min(1).max(40),
  /** The prompt side (word, root, concept, event…). */
  left: z.string().min(1).max(80),
  /** Its one true match (meaning, pattern, definition, place…). */
  right: z.string().min(1).max(80),
});

export const ItemsField = z.array(InteractiveItemSchema).max(8).nullable();
export const CorrectOrderField = z.array(z.string().max(40)).max(8).nullable();
export const BucketsField = z.array(InteractiveBucketSchema).max(4).nullable();
export const PairsField = z.array(InteractivePairSchema).max(6).nullable();

/**
 * A deterministic example payload (data is partial — the registry fills the
 * other flat keys with null). Goldens drive the mock provider, the exported
 * Flutter fixture, and the registry self-tests, so every approved tool has a
 * proven-renderable instance per subject it claims.
 */
export interface GoldenPayload {
  type: string;
  version: number;
  title: string;
  instructions: string;
  data: Partial<ToolDataView>;
  expectedLearningAction: string;
  followUpPrompt: string;
}

export interface ToolGolden {
  /** The subject this example demonstrates (docs + cross-subject coverage tests). */
  subject: Subject;
  concept: string;
  /** Mock routing: offer this golden when the student's question matches. */
  trigger: RegExp;
  payload: (ar: boolean) => GoldenPayload;
}

/** What the learner's action on this tool reports back. */
export type ResultKind = 'checked' | 'explored' | 'scored';

/** The canonical outcome wire values (same enum the result schema uses). */
export type ResultOutcome = 'correct' | 'partially_correct' | 'incorrect' | 'explored';

/**
 * The machine-verifiable half of a learner result — the final SUBMISSION,
 * not a verdict. One flat shape for all tools (like the payload data); each
 * tool reads only its own field. The server recomputes correctness from this
 * against the ORIGINAL stored instance, so a client-claimed outcome is never
 * trusted when an answer is present.
 */
export interface ResultAnswer {
  /** number_line: the final placed value. */
  value?: number | null;
  /** order_sequence: the item ids in the order the learner built. */
  order?: string[] | null;
  /** sort_buckets: where each item was FIRST placed (what scoring counts). */
  placements?: Array<{ itemId: string; bucketId: string }> | null;
  /** match_pairs: how many wrong picks happened before all pairs locked. */
  wrongTries?: number | null;
}

export const ResultAnswerSchema = z.object({
  value: z.number().nullable().optional(),
  order: z.array(z.string().max(40)).max(8).nullable().optional(),
  placements: z
    .array(z.object({ itemId: z.string().min(1).max(40), bucketId: z.string().min(1).max(40) }))
    .max(8)
    .nullable()
    .optional(),
  wrongTries: z.number().int().min(0).max(99).nullable().optional(),
});

/**
 * What a tool's verifier says about a submission:
 *  - a ResultOutcome — deterministically recomputed from the answer;
 *  - 'invalid'      — an answer was supplied but does not fit this instance
 *                     (unknown ids, non-finite value…): tampered or buggy,
 *                     never trusted;
 *  - 'unverifiable' — no usable answer field for this tool (old client):
 *                     fall back to the client-reported outcome, flagged as such.
 */
export type VerifyVerdict = ResultOutcome | 'invalid' | 'unverifiable';

/** Declared, tested RTL behavior (INTERACTIVE_PLATFORM.md §2 note). */
export type RtlBehavior = 'mirrors' | 'axis_ltr' | 'follows_text';

export interface ToolDescriptor<Id extends string = string> {
  /** Stable wire type — never reused, never renamed. */
  id: Id;
  /** Per-tool version; a bump invalidates THIS tool only, not the registry. */
  version: number;
  primitive: Primitive;
  /** Subjects this family serves; ['*'] = reusable as-is across all. */
  subjects: Array<Subject | '*'>;
  /** Concept families the tool genuinely helps with (selection guidance + docs). */
  conceptFamilies: string[];
  grades: { min: number; max: number };
  stages: LearningStage[];
  /** Primary input gesture — drives a11y planning (tap-first preferred). */
  interaction: 'tap' | 'drag' | 'slider' | 'mixed';
  resultKind: ResultKind;
  rtl: RtlBehavior;
  /** Declared accessibility behavior of the renderer (semantic labels, tap targets). */
  a11y: string;
  /** The ONLY approved Flutter renderer, by file (closed world on the client too). */
  flutterRenderer: string;
  /** May the context lens (market, building…) flavor labels? Never the concept. */
  supportsContextVariants: boolean;
  /** Honest-fallback guidance when the tool does not fit the question. */
  fallback: string;
  /** The flat data keys this tool owns (merged into the structural schema). */
  dataFields: Partial<Record<keyof ToolDataView, z.ZodType>>;
  /**
   * Semantic gate — is this data genuinely renderable? Runs server-side after
   * the structural schema, mirrored by the tool's Dart renderable check.
   */
  validate: (data: ToolDataView) => boolean;
  /**
   * Server-side result verification: recompute the outcome from the learner's
   * structured answer against THIS instance's data. Must mirror the tool's
   * Dart outcome logic (block_logic.dart) exactly.
   */
  verifyResult: (data: ToolDataView, answer: ResultAnswer) => VerifyVerdict;
  /** The exact bullet injected into the tutor system prompt for this tool. */
  promptSpec: string;
  goldens: ToolGolden[];
  /** Kill switch: an unavailable tool is never offered, never validated in. */
  available: boolean;
}
