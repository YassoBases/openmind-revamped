import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GameSpecSchema,
  StubSpecSchema,
  parseAndValidateGameSpec,
  validateGameSpec,
  collectTextFields,
  contentSpecJsonSchema,
  normalizedRequestJsonSchema,
  factCheckJsonSchema,
  buildStubSpec,
  buildIntroLevel,
  assembleMcqSpec,
  McqContentSpecSchema,
  type GameSpec,
} from '../src/index.js';

const SAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'samples');

function loadSample(name: string): unknown {
  return JSON.parse(readFileSync(join(SAMPLES_DIR, name), 'utf8'));
}

const fullSpecFiles = readdirSync(SAMPLES_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('stub_'));

describe('golden demo specs', () => {
  it('has the three English demos plus at least one Arabic demo', () => {
    expect(fullSpecFiles).toContain('quest_path_water_cycle.en.json');
    expect(fullSpecFiles).toContain('goal_shootout_world_capitals.en.json');
    expect(fullSpecFiles).toContain('draw_connect_plant_cell.en.json');
    expect(fullSpecFiles.some((f) => f.endsWith('.ar.json'))).toBe(true);
  });

  for (const file of fullSpecFiles) {
    it(`${file} passes structural + semantic validation (production schema)`, () => {
      const { spec, result } = parseAndValidateGameSpec(loadSample(file));
      expect(result.issues).toEqual([]);
      expect(result.ok).toBe(true);
      expect(spec).toBeDefined();
    });
  }

  it('every educational level over-provisions items across ≥2 difficulty bands', () => {
    for (const file of fullSpecFiles) {
      const spec = GameSpecSchema.parse(loadSample(file));
      for (const level of spec.levels.slice(1)) {
        expect(level.items.length).toBeGreaterThanOrEqual(4);
        expect(level.items.length).toBeLessThanOrEqual(6);
        expect(new Set(level.items.map((i) => i.difficulty)).size).toBeGreaterThanOrEqual(2);
        expect(level.teaching.length).toBeGreaterThanOrEqual(1);
        expect(level.teaching.length).toBeLessThanOrEqual(3);
        for (const item of level.items) {
          expect(item.hints.length).toBeGreaterThanOrEqual(1);
          expect(item.hints.length).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('stub sample validates against the stub schema', () => {
    expect(() => StubSpecSchema.parse(loadSample('stub_quest_path.en.json'))).not.toThrow();
  });
});

describe('semantic validators (mutation tests)', () => {
  const base = () => GameSpecSchema.parse(loadSample('quest_path_water_cycle.en.json'));

  it('rejects wrong level count', () => {
    const spec = base();
    spec.levels.pop();
    const r = validateGameSpec(spec);
    expect(r.issues.map((i) => i.code)).toContain('LEVEL_COUNT');
  });

  it('rejects educational content on the intro level', () => {
    const spec = base();
    spec.levels[0]!.items = spec.levels[1]!.items.slice(0, 4);
    const r = validateGameSpec(spec);
    expect(r.issues.map((i) => i.code)).toContain('INTRO_HAS_ITEMS');
  });

  it('rejects hints that reveal the answer verbatim', () => {
    const spec = base();
    const item = spec.levels[1]!.items[0]!;
    if (item.kind === 'mcq') item.hints[0] = `The answer is ${item.options[item.correctIndex]}.`;
    const r = validateGameSpec(spec);
    expect(r.issues.map((i) => i.code)).toContain('HINT_REVEALS_ANSWER');
    expect(r.issues.find((i) => i.code === 'HINT_REVEALS_ANSWER')?.targetId).toBe(item.id);
  });

  it('rejects duplicate options', () => {
    const spec = base();
    const item = spec.levels[1]!.items[0]!;
    if (item.kind === 'mcq') item.options[1] = item.options[0]!;
    const r = validateGameSpec(spec);
    expect(r.issues.map((i) => i.code)).toContain('OPTIONS_NOT_UNIQUE');
  });

  it('rejects a theme from another game type', () => {
    const spec = base();
    spec.meta.theme = 'football';
    const r = validateGameSpec(spec);
    expect(r.issues.map((i) => i.code)).toContain('THEME_INVALID');
  });

  it('rejects Arabic specs without Arabic script', () => {
    const spec = GameSpecSchema.parse(loadSample('quest_path_water_cycle.ar.json'));
    const item = spec.levels[1]!.items[0]!;
    item.prompt = 'What is evaporation?';
    if (item.kind === 'mcq') {
      item.options = ['Gas', 'Liquid', 'Solid', 'Plasma'];
      item.explanation = 'English text';
      item.hints = ['English hint'];
    }
    const r = validateGameSpec(spec);
    expect(r.issues.map((i) => i.code)).toContain('LANGUAGE_PURITY');
  });

  describe('draw_connect diagram rules', () => {
    const dcBase = () => GameSpecSchema.parse(loadSample('draw_connect_plant_cell.en.json'));

    it('valid sample passes', () => {
      expect(validateGameSpec(dcBase()).ok).toBe(true);
    });

    it('rejects nodes too close together (fat-finger rule)', () => {
      const spec = dcBase();
      spec.diagram!.nodes[1]!.x = spec.diagram!.nodes[0]!.x + 0.01;
      spec.diagram!.nodes[1]!.y = spec.diagram!.nodes[0]!.y + 0.01;
      const r = validateGameSpec(spec);
      expect(r.issues.map((i) => i.code)).toContain('NODES_TOO_CLOSE');
    });

    it('rejects out-of-bounds nodes', () => {
      const spec = dcBase();
      spec.diagram!.nodes[0]!.x = 0.99;
      const r = validateGameSpec(spec);
      expect(r.issues.map((i) => i.code)).toContain('NODE_OUT_OF_BOUNDS');
    });

    it('rejects edges referencing unknown nodes', () => {
      const spec = dcBase();
      spec.diagram!.edges.push({ from: 'nucleus', to: 'ghost_node' });
      const r = validateGameSpec(spec);
      expect(r.issues.map((i) => i.code)).toContain('EDGE_ENDPOINT_UNKNOWN');
    });

    it('rejects distractors that appear in edges', () => {
      const spec = dcBase();
      spec.diagram!.edges.push({ from: 'd_blood', to: 'f_store' });
      const r = validateGameSpec(spec);
      expect(r.issues.map((i) => i.code)).toContain('DISTRACTOR_CONNECTED');
    });

    it('rejects items referencing nonexistent edge ids', () => {
      const spec = dcBase();
      const item = spec.levels[1]!.items[0]!;
      if (item.kind === 'connect') item.edgeIds = ['nucleus->f_store'];
      const r = validateGameSpec(spec);
      expect(r.issues.map((i) => i.code)).toContain('EDGE_ID_UNKNOWN');
    });
  });
});

describe('assembly helpers', () => {
  const meta = GameSpecSchema.parse(loadSample('goal_shootout_world_capitals.en.json')).meta;
  const student = { name: 'Test', gender: null as const, color: '#1CB0F6' };

  it('buildStubSpec produces a valid stub', () => {
    const stub = buildStubSpec(meta, student);
    expect(() => StubSpecSchema.parse(stub)).not.toThrow();
    expect(stub.levels).toHaveLength(0);
    expect(stub.stub).toBe(true);
  });

  it('intro level is always empty and localized', () => {
    expect(buildIntroLevel(meta).items).toHaveLength(0);
    expect(buildIntroLevel({ ...meta, language: 'ar' }).title).toBe('الإحماء');
  });

  it('assembleMcqSpec produces a fully valid GameSpec from generated content', () => {
    const sample = GameSpecSchema.parse(loadSample('goal_shootout_world_capitals.en.json'));
    // Simulate LLM content: strip ids and the intro level from the golden sample.
    const content = McqContentSpecSchema.parse({
      narrative: sample.narrative,
      levels: sample.levels.slice(1).map((l) => ({
        title: l.title,
        teaching: l.teaching.map(({ id: _id, ...t }) => t),
        items: l.items.map((item) => {
          const { id: _id, kind: _kind, ...rest } = item as Record<string, unknown> & { id: string; kind: string };
          return rest;
        }),
      })),
      summaryHints: sample.summaryHints,
    });
    const assembled = assembleMcqSpec(meta, student, content);
    const r = parseAndValidateGameSpec(assembled);
    expect(r.result.issues).toEqual([]);
    expect(assembled.levels[0]!.isIntro).toBe(true);
    expect(assembled.levels[1]!.items[0]!.id).toBe('l1_i1');
    expect(assembled.student.name).toBe('Test');
  });
});

describe('structured-output JSON schemas', () => {
  it('generates lean draft-2020-12 schemas per game type', () => {
    for (const gt of ['quest_path', 'goal_shootout', 'draw_connect'] as const) {
      const schema = contentSpecJsonSchema(gt);
      expect(schema.type).toBe('object');
      expect(schema.$schema).toBeUndefined();
      const props = schema.properties as Record<string, unknown>;
      expect(props.levels).toBeDefined();
      if (gt === 'draw_connect') expect(props.diagram).toBeDefined();
      else expect(props.diagram).toBeUndefined();
    }
    expect(normalizedRequestJsonSchema().type).toBe('object');
    expect(factCheckJsonSchema().type).toBe('object');
  });
});

describe('collectTextFields', () => {
  it('collects every user-visible string for moderation', () => {
    const spec = GameSpecSchema.parse(loadSample('quest_path_water_cycle.en.json')) as GameSpec;
    const fields = collectTextFields(spec);
    expect(fields.length).toBeGreaterThan(50);
    expect(fields).toContain('The Water Cycle');
    expect(fields.some((f) => f.includes('Evaporation is liquid water'))).toBe(true);
  });
});
