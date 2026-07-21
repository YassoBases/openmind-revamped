import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GameSpecSchema,
  WorldPlanContentSchema,
  WorldCreateContentSchema,
  McqStageContentSchema,
  ConnectStageContentSchema,
  SceneStageContentSchema,
  assembleStageSpec,
  validateGameSpec,
  validateWorldPlan,
  type GameSpec,
  type McqStageContent,
  type StageContent,
  type Student,
  type WorldPlanContent,
  type WorldStagePlan,
} from '../src/index.js';

const SAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'samples');

function loadSample(name: string): GameSpec {
  return GameSpecSchema.parse(JSON.parse(readFileSync(join(SAMPLES_DIR, name), 'utf8')));
}

/** Lift one educational level of a golden sample into stage content. */
function stageContentFrom(sampleFile: string, levelIndex = 1): StageContent {
  const spec = loadSample(sampleFile);
  const level = spec.levels[levelIndex]!;
  const content: Record<string, unknown> = {
    title: level.title,
    teaching: level.teaching.map(({ id: _id, ...t }) => t),
    items: level.items.map((item) => {
      const { id: _id, kind, ...rest } = item as Record<string, unknown> & { id: string; kind: string };
      return spec.meta.gameType === 'scene_play' ? { kind, ...rest } : rest;
    }),
  };
  if (spec.meta.gameType === 'draw_connect') content.diagram = spec.diagram;
  if (level.observe) content.observe = level.observe;
  if (level.notice) content.notice = level.notice;
  return content as unknown as StageContent;
}

const student: Student = { name: 'Test', gender: null, color: '#079A90' };

function basePlan(): WorldPlanContent {
  const stage = (over: Partial<WorldStagePlan>): WorldStagePlan => ({
    focus: 'Evaporation',
    beat: 'The river mist rises toward the sun.',
    gameType: 'quest_path',
    variant: 'classic',
    ramp: 1,
    ...over,
  });
  return WorldPlanContentSchema.parse({
    title: 'The Water Cycle Journey',
    arc: {
      intro: 'A drop of water dreams of seeing the whole sky.',
      outro: 'The drop has traveled the whole cycle — and so have you.',
    },
    stages: [
      stage({}),
      stage({ gameType: 'goal_shootout', focus: 'Condensation', ramp: 1 }),
      stage({ gameType: 'draw_connect', focus: 'The cycle diagram', ramp: 2 }),
      stage({ gameType: 'scene_play', focus: 'Clouds form', learningLevel: 'recognize', ramp: 2 }),
      stage({ gameType: 'scene_play', focus: 'Rain falls', learningLevel: 'apply', ramp: 3 }),
      stage({ gameType: 'quest_path', focus: 'The full cycle', ramp: 3 }),
    ],
    summaryHints: { concepts: ['water cycle'], nextTopics: ['weather'] },
  } satisfies WorldPlanContent);
}

describe('WorldPlan validation', () => {
  it('accepts a coherent plan', () => {
    const r = validateWorldPlan(basePlan(), 'en');
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('rejects a world that does not open with an MCQ-family stage', () => {
    const plan = basePlan();
    plan.stages[0]!.gameType = 'draw_connect';
    expect(validateWorldPlan(plan, 'en').issues.map((i) => i.code)).toContain('STAGE1_NOT_MCQ');
  });

  it('rejects a variant from another family and a foreign theme', () => {
    const plan = basePlan();
    plan.stages[1]!.variant = 'bridge_builder'; // quest_path's, not goal_shootout's
    plan.stages[2]!.theme = 'football';
    const codes = validateWorldPlan(plan, 'en').issues.map((i) => i.code);
    expect(codes).toContain('VARIANT_INVALID');
    expect(codes).toContain('THEME_INVALID');
  });

  it('accepts every registered variant in its own family', () => {
    const plan = basePlan();
    plan.stages[0]!.gameType = 'goal_shootout';
    plan.stages[0]!.variant = 'draw_pass';
    plan.stages[2]!.variant = 'sort_streams'; // draw_connect stage
    const r = validateWorldPlan(plan, 'en');
    expect(r.issues.map((i) => i.code)).not.toContain('VARIANT_INVALID');
  });

  it('rejects scene stages that walk the ladder backwards or omit the rung', () => {
    const plan = basePlan();
    plan.stages[3]!.learningLevel = 'challenge';
    plan.stages[4]!.learningLevel = 'recognize';
    expect(validateWorldPlan(plan, 'en').issues.map((i) => i.code)).toContain('LADDER_ORDER');

    const plan2 = basePlan();
    delete plan2.stages[3]!.learningLevel;
    expect(validateWorldPlan(plan2, 'en').issues.map((i) => i.code)).toContain('STAGE_RUNG_MISSING');
  });

  it('rejects a decreasing difficulty ramp', () => {
    const plan = basePlan();
    plan.stages[4]!.ramp = 1;
    expect(validateWorldPlan(plan, 'en').issues.map((i) => i.code)).toContain('RAMP_ORDER');
  });

  it('enforces Arabic script for Arabic worlds', () => {
    const plan = basePlan();
    const codes = validateWorldPlan(plan, 'ar').issues.map((i) => i.code);
    expect(codes).toContain('LANGUAGE_PURITY');
  });
});

describe('stage content schemas', () => {
  it('golden sample levels lift into valid stage content per family', () => {
    expect(() => McqStageContentSchema.parse(stageContentFrom('quest_path_water_cycle.en.json'))).not.toThrow();
    expect(() => McqStageContentSchema.parse(stageContentFrom('goal_shootout_world_capitals.en.json'))).not.toThrow();
    expect(() => ConnectStageContentSchema.parse(stageContentFrom('draw_connect_plant_cell.en.json'))).not.toThrow();
    expect(() => SceneStageContentSchema.parse(stageContentFrom('scene_play_simple_machines.en.json'))).not.toThrow();
  });

  it('the combined world-create shape parses (plan + MCQ stage 1)', () => {
    const parsed = WorldCreateContentSchema.parse({
      plan: basePlan(),
      stage1: stageContentFrom('quest_path_water_cycle.en.json'),
    });
    expect(parsed.plan.stages).toHaveLength(6);
  });
});

describe('assembleStageSpec', () => {
  const assemble = (stageIndex: number, sampleFile = 'quest_path_water_cycle.en.json', planIndex = 0) => {
    const plan = basePlan();
    return assembleStageSpec({
      worldId: 'w1',
      stageIndex,
      stagePlan: plan.stages[planIndex]!,
      arc: plan.arc,
      summaryHints: plan.summaryHints,
      subject: 'Science',
      language: 'en',
      grade: 3,
      student,
      content: stageContentFrom(sampleFile),
    });
  };

  it('stage 1 carries the intro/tutorial level; later stages do not', () => {
    const s1 = assemble(1);
    expect(s1.levels).toHaveLength(2);
    expect(s1.levels[0]!.isIntro).toBe(true);
    expect(s1.levels[1]!.index).toBe(1);

    const s3 = assemble(3);
    expect(s3.levels).toHaveLength(1);
    expect(s3.levels[0]!.isIntro).toBe(false);
    expect(s3.levels[0]!.index).toBe(0);
  });

  it('stamps world-unique ids and the stage linkage', () => {
    const s3 = assemble(3);
    expect(s3.meta.scope).toBe('stage');
    expect(s3.meta.worldId).toBe('w1');
    expect(s3.meta.stageIndex).toBe(3);
    expect(s3.levels[0]!.items[0]!.id).toBe('s3_i1');
    expect(s3.levels[0]!.teaching[0]!.id).toBe('s3_t1');
    expect(s3.narrative?.perLevel).toEqual([basePlan().stages[0]!.beat]);
  });

  it('assembled stage specs pass structural + semantic validation', () => {
    for (const stageIndex of [1, 4]) {
      const spec = GameSpecSchema.parse(assemble(stageIndex));
      const r = validateGameSpec(spec);
      expect(r.issues).toEqual([]);
    }
  });

  it('a connect stage owns its diagram and validates', () => {
    const spec = GameSpecSchema.parse(assemble(2, 'draw_connect_plant_cell.en.json', 2));
    expect(spec.diagram).toBeDefined();
    expect(validateGameSpec(spec).issues).toEqual([]);
  });

  it('a scene stage carries its single ladder rung from the PLAN and validates', () => {
    const spec = GameSpecSchema.parse(assemble(4, 'scene_play_simple_machines.en.json', 3));
    expect(spec.levels[0]!.learningLevel).toBe('recognize');
    expect(validateGameSpec(spec).issues).toEqual([]);
  });

  it('stage-scope guards: two educational levels or a missing world link fail', () => {
    const spec = assemble(3);
    const extra = { ...spec.levels[0]!, index: 1 };
    const twoLevels: GameSpec = { ...spec, levels: [spec.levels[0]!, extra] };
    expect(validateGameSpec(twoLevels).issues.map((i) => i.code)).toContain('STAGE_LEVEL_COUNT');

    const unlinked: GameSpec = { ...spec, meta: { ...spec.meta, worldId: undefined } };
    expect(validateGameSpec(unlinked).issues.map((i) => i.code)).toContain('STAGE_LINK_MISSING');
  });
});
