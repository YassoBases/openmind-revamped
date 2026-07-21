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
import { ConnectContentSpecSchema, McqContentSpecSchema, ScenePlayContentSpecSchema } from './gamespec.js';
import { WorldCreateContentSchema, stageContentSchemaFor } from './worldspec.js';
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
  if (gameType === 'draw_connect') return toLeanJsonSchema(ConnectContentSpecSchema);
  if (gameType === 'scene_play') return toLeanJsonSchema(ScenePlayContentSpecSchema);
  return toLeanJsonSchema(McqContentSpecSchema);
}

/** Combined world-creation output: WorldPlan + stage-1 content (MCQ-shaped). */
export function worldCreateJsonSchema(): Record<string, unknown> {
  return toLeanJsonSchema(WorldCreateContentSchema);
}

/** Per-family stage-content schema for the per-stage generation call. */
export function stageContentJsonSchema(gameType: GameType): Record<string, unknown> {
  return toLeanJsonSchema(stageContentSchemaFor(gameType) as z.ZodType);
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

/**
 * Targeted repair for scene_play items. Kept as a SEPARATE schema (selected
 * by gameType) so the classic repair schema stays lean — the scene kinds'
 * payload fields would otherwise fatten every repair call. All fields beyond
 * the common ones are optional; semantic validators re-run on the result.
 */
const idLabel = z.object({ id: z.string(), label: z.string() });

export const RepairSceneItemsSchema = z.object({
  items: z
    .array(
      z.object({
        /** Id of the item being replaced (server keeps ids stable). */
        replacesId: z.string(),
        /** Item kind — must match the kind being replaced. */
        kind: z.enum(['rotation_transform', 'cause_effect', 'find_fix', 'create_express']),
        prompt: z.string(),
        explanation: z.string(),
        hints: z.array(z.string()).min(1).max(2),
        concepts: z.array(z.string()).min(1),
        difficulty: z.number().int().min(1).max(5),
        // rotation_transform
        object: idLabel.optional(),
        startAngle: z.number().int().optional(),
        targetAngle: z.number().int().optional(),
        snapAngle: z.number().int().optional(),
        symmetryFold: z.number().int().optional(),
        // cause_effect
        variable: z.object({ label: z.string(), settings: z.array(idLabel) }).optional(),
        outcomes: z.array(idLabel).optional(),
        mapping: z.array(z.object({ settingId: z.string(), outcomeId: z.string() })).optional(),
        goalOutcomeId: z.string().optional(),
        // find_fix
        objects: z
          .array(z.object({ id: z.string(), label: z.string(), mistake: z.boolean(), correctionId: z.string().optional() }))
          .optional(),
        corrections: z.array(idLabel).optional(),
        // create_express
        palette: z.array(idLabel).optional(),
        minElements: z.number().int().optional(),
        mustInclude: z.array(z.string()).optional(),
      }),
    )
    .min(1),
});
export type RepairSceneItems = z.infer<typeof RepairSceneItemsSchema>;

export function repairSceneItemsJsonSchema(): Record<string, unknown> {
  return toLeanJsonSchema(RepairSceneItemsSchema);
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
