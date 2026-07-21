/**
 * Lesson Worlds — the stage-based play contract.
 *
 * A world turns one school lesson (or free topic) into a planned sequence of
 * short stages. ONE small LLM call produces the WorldPlan (narrative arc +
 * per-stage concept focus / game family / variant / difficulty ramp) PLUS the
 * first stage's content, so a world is playable from a single request. Every
 * later stage is its own small generation call validated against the per-stage
 * schemas here, prefetched while the previous stage is being played.
 *
 * Mirrors the ContentSpec/GameSpec doctrine: the LLM output carries no ids and
 * no student; assembly (assembleStageSpec in assemble.ts) stamps determinism.
 */
import { z } from 'zod';
import {
  ARABIC_SCRIPT_RE,
  KITS_BY_GAME,
  LEARNING_LEVELS,
  STAGE_GENERATABLE_GAME_TYPES,
  THEMES,
  VARIANTS_BY_GAME,
  type GameType,
} from './constants.js';
import {
  DiagramSchema,
  GeneratedCityLevelSchema,
  GeneratedConnectLevelSchema,
  GeneratedMcqLevelSchema,
  GeneratedSceneLevelSchema,
  SummaryHintsSchema,
  type SpecIssue,
  type ValidationResult,
} from './gamespec.js';

/** Families whose stages walk the learning ladder (rung required per stage). */
const LADDER_STAGE_FAMILIES: ReadonlySet<string> = new Set(['scene_play', 'number_city']);

// ---------------------------------------------------------------------------
// World shape constants
// ---------------------------------------------------------------------------

/** Stages per world, finale included. Short worlds still feel like a journey;
 *  long ones never outlast a child's interest in one lesson. */
export const WORLD_STAGES_MIN = 6;
export const WORLD_STAGES_MAX = 9;

/** Coarse difficulty bands for the ramp — deliberately coarse so per-child
 *  adaptation (the previous stage's accuracy band rides the generation
 *  prompt) never fragments the stage content cache. */
export const RAMP_BANDS = [1, 2, 3] as const;
export type RampBand = (typeof RAMP_BANDS)[number];

/** Ramp band → the Meta difficulty baseline the stage spec is assembled with. */
export const DIFFICULTY_BY_RAMP: Record<RampBand, 'easy' | 'normal' | 'hard'> = {
  1: 'easy',
  2: 'normal',
  3: 'hard',
};

/**
 * The first stage of every world is an MCQ-family stage (quest_path /
 * goal_shootout): the combined plan+stage-1 call then has ONE statically
 * known stage-content shape, and worlds always open with the lightest,
 * fastest template.
 */
export const STAGE1_GAME_TYPES = ['quest_path', 'goal_shootout'] as const;

// ---------------------------------------------------------------------------
// WorldPlan — the orchestrator the planner LLM produces
// ---------------------------------------------------------------------------

export const WorldStagePlanSchema = z.object({
  /** Concept focus of this stage (also the stage spec's topic). */
  focus: z.string().min(1).max(120),
  /** One narrative line — this stage's beat in the world's arc. */
  beat: z.string().min(1).max(220),
  gameType: z.enum(STAGE_GENERATABLE_GAME_TYPES),
  /** Mechanic variant within the family (VARIANTS_BY_GAME). */
  variant: z.string().min(1).max(40),
  /** Visual theme within the family (THEMES); defaults to the family's first. */
  theme: z.string().min(1).max(40).optional(),
  /** Interest kit for scene games (KITS_BY_GAME). */
  kit: z.string().min(1).max(20).optional(),
  /** Ladder rung for scene stages — coherence is validated ACROSS the plan
   *  (a single stage carries a single rung; the world walks the ladder). */
  learningLevel: z.enum(LEARNING_LEVELS).optional(),
  /** Coarse difficulty band this stage was planned at. */
  ramp: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
export type WorldStagePlan = z.infer<typeof WorldStagePlanSchema>;

export const WorldPlanContentSchema = z.object({
  /** World title in the child's language. */
  title: z.string().min(1).max(80),
  /** Narrative arc: intro shown on the map / first stage, outro at the finale. */
  arc: z.object({
    intro: z.string().min(1).max(400),
    outro: z.string().min(1).max(400),
  }),
  stages: z.array(WorldStagePlanSchema).min(WORLD_STAGES_MIN).max(WORLD_STAGES_MAX),
  summaryHints: SummaryHintsSchema,
});
export type WorldPlanContent = z.infer<typeof WorldPlanContentSchema>;

// ---------------------------------------------------------------------------
// StageContent — what the stage LLM call produces (≈ one educational level)
// ---------------------------------------------------------------------------

/** quest_path / goal_shootout stage content. */
export const McqStageContentSchema = GeneratedMcqLevelSchema;
export type McqStageContent = z.infer<typeof McqStageContentSchema>;

/** draw_connect stage content — each stage owns its own small diagram. */
export const ConnectStageContentSchema = z.object({
  ...GeneratedConnectLevelSchema.shape,
  diagram: DiagramSchema,
});
export type ConnectStageContent = z.infer<typeof ConnectStageContentSchema>;

/** scene_play stage content — one ladder rung's level. */
export const SceneStageContentSchema = GeneratedSceneLevelSchema;
export type SceneStageContent = z.infer<typeof SceneStageContentSchema>;

/** number_city (My Town) stage content — one rung's level of city mechanics. */
export const CityStageContentSchema = GeneratedCityLevelSchema;
export type CityStageContent = z.infer<typeof CityStageContentSchema>;

export type StageContent =
  | McqStageContent
  | ConnectStageContent
  | SceneStageContent
  | CityStageContent;

/** Pick the stage-content schema for a family. */
export function stageContentSchemaFor(gameType: GameType): z.ZodTypeAny {
  if (gameType === 'draw_connect') return ConnectStageContentSchema;
  if (gameType === 'scene_play') return SceneStageContentSchema;
  if (gameType === 'number_city') return CityStageContentSchema;
  return McqStageContentSchema;
}

/** The combined world-creation LLM output: the plan plus stage 1's content
 *  (statically MCQ-shaped — see STAGE1_GAME_TYPES). */
export const WorldCreateContentSchema = z.object({
  plan: WorldPlanContentSchema,
  stage1: McqStageContentSchema,
});
export type WorldCreateContent = z.infer<typeof WorldCreateContentSchema>;

// ---------------------------------------------------------------------------
// Semantic validation (stable issue codes, same doctrine as validateGameSpec)
// ---------------------------------------------------------------------------

function push(issues: SpecIssue[], code: string, path: string, message: string) {
  issues.push({ code, path, message });
}

/**
 * Semantic rules the Zod shape can't express. `language` is the world's
 * language ('ar' enforces Arabic script in child-visible text).
 */
export function validateWorldPlan(plan: WorldPlanContent, language: string): ValidationResult {
  const issues: SpecIssue[] = [];

  const first = plan.stages[0];
  if (first && !(STAGE1_GAME_TYPES as readonly string[]).includes(first.gameType)) {
    push(issues, 'STAGE1_NOT_MCQ', 'stages[0].gameType',
      `the first stage must be one of [${STAGE1_GAME_TYPES.join(', ')}] so worlds start instantly`);
  }

  let lastRamp = 0;
  let lastRung = -1;
  plan.stages.forEach((stage, i) => {
    const p = `stages[${i}]`;

    const variants = VARIANTS_BY_GAME[stage.gameType];
    if (!variants.includes(stage.variant)) {
      push(issues, 'VARIANT_INVALID', `${p}.variant`,
        `variant "${stage.variant}" is not one of [${variants.join(', ')}] for ${stage.gameType}`);
    }

    if (stage.theme) {
      const themes = THEMES[stage.gameType];
      if (!themes.includes(stage.theme)) {
        push(issues, 'THEME_INVALID', `${p}.theme`,
          `theme "${stage.theme}" is not one of [${themes.join(', ')}] for ${stage.gameType}`);
      }
    }

    if (stage.kit) {
      const kits = KITS_BY_GAME[stage.gameType] as readonly string[];
      if (!kits.includes(stage.kit)) {
        push(issues, 'WRAPPER_INVALID', `${p}.kit`,
          `kit "${stage.kit}" is not one of [${kits.join(', ')}] for ${stage.gameType}`);
      }
    }

    // Ladder families (scene_play, number_city) carry a rung; across the
    // world their stages walk the ladder in canonical order, never backwards.
    if (LADDER_STAGE_FAMILIES.has(stage.gameType)) {
      if (!stage.learningLevel) {
        push(issues, 'STAGE_RUNG_MISSING', `${p}.learningLevel`,
          `${stage.gameType} stages must name their learning-ladder rung`);
      } else {
        const rung = LEARNING_LEVELS.indexOf(stage.learningLevel);
        if (rung < lastRung) {
          push(issues, 'LADDER_ORDER', `${p}.learningLevel`,
            `ladder stages must walk forward (got ${stage.learningLevel} after ${LEARNING_LEVELS[lastRung]})`);
        }
        lastRung = Math.max(lastRung, rung);
      }
    }

    // The ramp is the world's difficulty arc: it never goes backwards.
    if (stage.ramp < lastRamp) {
      push(issues, 'RAMP_ORDER', `${p}.ramp`, 'the difficulty ramp must never decrease across stages');
    }
    lastRamp = stage.ramp;

    if (language === 'ar' && !ARABIC_SCRIPT_RE.test(`${stage.beat}`)) {
      push(issues, 'LANGUAGE_PURITY', `${p}.beat`, 'Arabic world beat contains no Arabic script');
    }
  });

  if (language === 'ar') {
    if (!ARABIC_SCRIPT_RE.test(plan.title)) {
      push(issues, 'LANGUAGE_PURITY', 'title', 'Arabic world title contains no Arabic script');
    }
    if (!ARABIC_SCRIPT_RE.test(plan.arc.intro) || !ARABIC_SCRIPT_RE.test(plan.arc.outro)) {
      push(issues, 'LANGUAGE_PURITY', 'arc', 'Arabic world arc contains no Arabic script');
    }
  }

  return { ok: issues.length === 0, issues };
}
