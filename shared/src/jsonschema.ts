/**
 * Lean JSON Schemas for Claude structured outputs.
 *
 * The API enforces schema-complexity limits, so we hand the model the
 * narrow per-gameType ContentSpec schema (no meta/student, no ids, no
 * intro level) rather than the full GameSpec. Semantic rules (spacing,
 * difficulty bands, hint-reveal checks…) stay in validateGameSpec —
 * structured outputs guarantee syntax, our validators guarantee meaning.
 */
import { z } from 'zod';
import { ConnectContentSpecSchema, McqContentSpecSchema } from './gamespec.js';
import type { GameType } from './constants.js';

/**
 * Claude structured outputs accept a JSON Schema subset: no min/max length,
 * no numeric bounds, no pattern, and every object must carry
 * `additionalProperties: false`. We strip what the API rejects (those rules
 * still run in validateGameSpec) and enforce the object rule recursively.
 */
const UNSUPPORTED_KEYS = [
  'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum',
  'exclusiveMaximum', 'multipleOf', 'minItems', 'maxItems', 'pattern',
  'minContains', 'maxContains', 'uniqueItems', 'default',
] as const;

export function sanitizeForClaude(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeForClaude);
  if (node === null || typeof node !== 'object') return node;
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if ((UNSUPPORTED_KEYS as readonly string[]).includes(k)) continue;
    obj[k] = sanitizeForClaude(v);
  }
  if (obj.type === 'object') obj.additionalProperties = false;
  return obj;
}

function toLeanJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'output' }) as Record<string, unknown>;
  delete json.$schema;
  return sanitizeForClaude(json) as Record<string, unknown>;
}

export function contentSpecJsonSchema(gameType: GameType): Record<string, unknown> {
  return gameType === 'draw_connect'
    ? toLeanJsonSchema(ConnectContentSpecSchema)
    : toLeanJsonSchema(McqContentSpecSchema);
}

/** Schema for targeted item repair: the model returns replacement items only. */
export const RepairItemsSchema = z.object({
  items: z
    .array(
      z.object({
        /** Id of the item being replaced (server keeps ids stable). */
        replacesId: z.string(),
        prompt: z.string(),
        options: z.array(z.string()).length(4).optional(),
        correctIndex: z.number().int().min(0).max(3).optional(),
        edgeIds: z.array(z.string()).optional(),
        explanation: z.string(),
        hints: z.array(z.string()).min(1).max(2),
        concepts: z.array(z.string()).min(1),
        difficulty: z.number().int().min(1).max(5),
      }),
    )
    .min(1),
});
export type RepairItems = z.infer<typeof RepairItemsSchema>;

export function repairItemsJsonSchema(): Record<string, unknown> {
  return toLeanJsonSchema(RepairItemsSchema);
}

/** Normalizer output: raw questionnaire text → structured request. */
export const NormalizedRequestSchema = z.object({
  subject: z.string(),
  topic: z.string(),
  /** 0–1; below the threshold the pipeline asks ONE clarifying question. */
  confidence: z.number().min(0).max(1),
  /** 0–1; high complexity is an escalation signal (Haiku → Sonnet). */
  complexity: z.number().min(0).max(1),
  clarifyingQuestion: z.string().nullable(),
  /** Branded-character requests mapped to original archetypes (IP rule). */
  remappedInterest: z.string().nullable(),
  notes: z.string().nullable(),
});
export type NormalizedRequest = z.infer<typeof NormalizedRequestSchema>;

export function normalizedRequestJsonSchema(): Record<string, unknown> {
  return toLeanJsonSchema(NormalizedRequestSchema);
}

/** Fact-check judge verdicts (one per teach card / item / hint group). */
export const FactCheckReportSchema = z.object({
  verdicts: z
    .array(
      z.object({
        targetId: z.string(),
        verdict: z.enum(['pass', 'fail']),
        reason: z.string(),
      }),
    )
    .min(1),
});
export type FactCheckReport = z.infer<typeof FactCheckReportSchema>;

export function factCheckJsonSchema(): Record<string, unknown> {
  return toLeanJsonSchema(FactCheckReportSchema);
}

/** Summary enrichment output (end-of-game personalized feedback). */
export const EnrichedFeedbackSchema = z.object({
  headline: z.string(),
  body: z.string(),
  reviewSuggestions: z.array(z.string()).max(3),
});
export type EnrichedFeedback = z.infer<typeof EnrichedFeedbackSchema>;

export function enrichedFeedbackJsonSchema(): Record<string, unknown> {
  return toLeanJsonSchema(EnrichedFeedbackSchema);
}
