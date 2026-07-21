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
  KINDS_BY_GAME,
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

  it('accepts the classic variant and rejects an unknown one', () => {
    const ok = base();
    ok.meta.variant = 'classic';
    expect(validateGameSpec(ok).issues.map((i) => i.code)).not.toContain('VARIANT_INVALID');

    const bad = base();
    bad.meta.variant = 'draw_pass'; // not registered for this family yet
    expect(validateGameSpec(bad).issues.map((i) => i.code)).toContain('VARIANT_INVALID');
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

// ---------------------------------------------------------------------------
// Learning-system contract (Number City foundations): scene item kinds,
// the learning ladder, conceptId and wrapper.
// ---------------------------------------------------------------------------

describe('scene item kinds', () => {
  const base = () => GameSpecSchema.parse(loadSample('quest_path_water_cycle.en.json')) as GameSpec;

  const itemCommon = {
    id: 'l1_s1',
    prompt: 'Tap every bird!',
    explanation: 'There were three birds in the garden.',
    hints: ['Look near the tree.'],
    concepts: ['counting'],
    difficulty: 1,
  };
  const tapScene = () => ({
    kind: 'tap_scene' as const,
    ...itemCommon,
    objects: [
      { id: 'o1', label: '🐦', correct: true },
      { id: 'o2', label: '🐦‍⬛', correct: true },
      { id: 'o3', label: '🌸', correct: false },
      { id: 'o4', label: '🪨', correct: false },
    ],
  });
  const buildComplete = () => ({
    kind: 'build_complete' as const,
    ...itemCommon,
    id: 'l1_b1',
    pieces: [
      { id: 'p1', label: '٣', gap: false },
      { id: 'p2', label: '+', gap: false },
      { id: 'p3', label: '٢', gap: true },
      { id: 'p4', label: '= ٥', gap: false },
    ],
    options: [
      { id: 'c1', label: '٢' },
      { id: 'c2', label: '٤' },
    ],
  });

  /** Swap one quest item for a scene item and let draw the issues out. */
  function withItem(item: unknown): GameSpec {
    const spec = base();
    (spec.levels[1]!.items as unknown[])[0] = item;
    return GameSpecSchema.parse(spec);
  }

  it('all four scene kinds parse structurally', () => {
    expect(() => withItem(tapScene())).not.toThrow();
    expect(() => withItem(buildComplete())).not.toThrow();
    expect(() => withItem({
      kind: 'drag_collect', ...itemCommon, containerLabel: 'The basket',
      objects: tapScene().objects,
    })).not.toThrow();
    expect(() => withItem({
      kind: 'sequence', ...itemCommon,
      steps: [{ id: 's1', label: 'Seed' }, { id: 's2', label: 'Sprout' }, { id: 's3', label: 'Tree' }],
    })).not.toThrow();
  });

  it('kind eligibility comes from the KINDS_BY_GAME table, not a ternary', () => {
    // quest_path renders only mcq, so a structurally-valid tap_scene item
    // must be rejected semantically with the stable ITEM_KIND code.
    const r = validateGameSpec(withItem(tapScene()));
    expect(r.issues.map((i) => i.code)).toContain('ITEM_KIND');
    expect(r.issues.find((i) => i.code === 'ITEM_KIND')!.targetId).toBe('l1_s1');
  });

  it('scene objects need ≥1 correct and ≥1 distractor', () => {
    const allWrong = tapScene();
    allWrong.objects.forEach((o) => { o.correct = false; });
    expect(validateGameSpec(withItem(allWrong)).issues.map((i) => i.code)).toContain('SCENE_NO_CORRECT');

    const allRight = tapScene();
    allRight.objects.forEach((o) => { o.correct = true; });
    expect(validateGameSpec(withItem(allRight)).issues.map((i) => i.code)).toContain('SCENE_NO_DISTRACTOR');
  });

  it('sequence steps must be unique', () => {
    const r = validateGameSpec(withItem({
      kind: 'sequence', ...itemCommon,
      steps: [{ id: 's1', label: 'Seed' }, { id: 's2', label: 'Seed' }, { id: 's3', label: 'Tree' }],
    }));
    expect(r.issues.map((i) => i.code)).toContain('SEQUENCE_STEPS_NOT_UNIQUE');
  });

  it('build_complete needs gaps, matching options and a distractor', () => {
    const noGap = buildComplete();
    noGap.pieces.forEach((p) => { p.gap = false; });
    expect(validateGameSpec(withItem(noGap)).issues.map((i) => i.code)).toContain('BUILD_NO_GAP');

    const orphanGap = buildComplete();
    orphanGap.options = [{ id: 'c1', label: '٩' }, { id: 'c2', label: '٤' }];
    expect(validateGameSpec(withItem(orphanGap)).issues.map((i) => i.code)).toContain('BUILD_OPTION_MISSING');

    const noDistractor = buildComplete();
    noDistractor.options = [{ id: 'c1', label: '٢' }, { id: 'c2', label: '٢' }];
    const codes = validateGameSpec(withItem(noDistractor)).issues.map((i) => i.code);
    expect(codes).toContain('OPTIONS_NOT_UNIQUE');
  });

  it('hints may not reveal a correct scene label verbatim', () => {
    const leaky = tapScene();
    leaky.objects[0]!.label = 'bluebird';
    leaky.hints = ['Look for the bluebird by the tree.'];
    expect(validateGameSpec(withItem(leaky)).issues.map((i) => i.code)).toContain('HINT_REVEALS_ANSWER');
  });
});

describe('learning ladder + concept + wrapper', () => {
  const base = () => GameSpecSchema.parse(loadSample('quest_path_water_cycle.en.json')) as GameSpec;

  it('conceptId and wrapper parse on meta; unknown wrapper is rejected', () => {
    const spec = base();
    spec.meta.conceptId = 'add_within_10';
    spec.meta.wrapper = 'nature';
    expect(() => GameSpecSchema.parse(spec)).not.toThrow();
    // quest_path has no kit art tables (KITS_BY_GAME) — a wrapper there is
    // meaningless and flagged, while the spec still parses structurally.
    expect(validateGameSpec(GameSpecSchema.parse(spec)).issues.map((i) => i.code))
      .toContain('WRAPPER_INVALID');
    delete spec.meta.wrapper;
    expect(validateGameSpec(GameSpecSchema.parse(spec)).ok).toBe(true);

    const bad = { ...spec, meta: { ...spec.meta, wrapper: 'dinosaurs' } };
    expect(GameSpecSchema.safeParse(bad).success).toBe(false);
  });

  it('classic sessions (no learningLevel anywhere) stay valid', () => {
    expect(validateGameSpec(base()).ok).toBe(true);
  });

  it('a partially-tagged ladder is rejected', () => {
    const spec = base();
    spec.levels[1]!.learningLevel = 'recognize';
    const r = validateGameSpec(spec);
    expect(r.issues.map((i) => i.code)).toContain('LEARNING_LEVELS_INCOMPLETE');
  });

  it('a fully-tagged ladder must be recognize→understand→apply→challenge in order', () => {
    // the EN water-cycle demo has sessionLength 5 → exactly 4 educational levels
    const wrongOrder = base();
    const shuffled = ['understand', 'recognize', 'apply', 'challenge'] as const;
    wrongOrder.levels.slice(1).forEach((l, i) => { l.learningLevel = shuffled[i]; });
    expect(validateGameSpec(wrongOrder).issues.map((i) => i.code)).toContain('LEARNING_LEVELS_ORDER');

    const rightOrder = base();
    const canonical = ['recognize', 'understand', 'apply', 'challenge'] as const;
    rightOrder.levels.slice(1).forEach((l, i) => { l.learningLevel = canonical[i]; });
    expect(validateGameSpec(rightOrder).ok).toBe(true);
  });

  it('the intro level never carries a learning level', () => {
    const spec = base();
    spec.levels[0]!.learningLevel = 'recognize';
    const r = validateGameSpec(spec);
    expect(r.issues.map((i) => i.code)).toContain('INTRO_LEARNING_LEVEL');
  });
});

describe('Number City golden lessons (Shapes District)', () => {
  const nature = () => GameSpecSchema.parse(loadSample('number_city_shapes_nature.ar.json')) as GameSpec;
  const construction = () =>
    GameSpecSchema.parse(loadSample('number_city_shapes_construction.ar.json')) as GameSpec;

  it('both wrapper goldens are bundled', () => {
    expect(fullSpecFiles).toContain('number_city_shapes_nature.ar.json');
    expect(fullSpecFiles).toContain('number_city_shapes_construction.ar.json');
  });

  it('wrappers differ ONLY in meta.wrapper — identical items, verification, difficulty, evidence inputs', () => {
    const a = nature();
    const b = construction();
    expect(a.meta.wrapper).toBe('nature');
    expect(b.meta.wrapper).toBe('construction');
    const strip = (spec: GameSpec) => ({ ...spec, meta: { ...spec.meta, wrapper: undefined } });
    expect(strip(b)).toEqual(strip(a));
  });

  it('the session climbs the full ladder with observe/notice captions on every educational level', () => {
    const spec = nature();
    const edu = spec.levels.filter((l) => !l.isIntro);
    expect(edu.map((l) => l.learningLevel)).toEqual(['recognize', 'understand', 'apply', 'challenge']);
    for (const l of edu) {
      expect(l.observe, `level ${l.index} missing observe caption`).toBeTruthy();
      expect(l.notice, `level ${l.index} missing notice caption`).toBeTruthy();
    }
  });

  it('number_city REQUIRES the learning ladder', () => {
    const spec = nature();
    for (const l of spec.levels) delete l.learningLevel;
    expect(validateGameSpec(spec).issues.map((i) => i.code)).toContain('LEARNING_LEVELS_REQUIRED');
  });

  it('number_city registers exactly the four scene kinds and the lesson uses only those', () => {
    expect([...KINDS_BY_GAME.number_city]).toEqual(['tap_scene', 'drag_collect', 'sequence', 'build_complete']);
    const used = new Set(nature().levels.flatMap((l) => l.items.map((i) => i.kind)));
    expect(used.size).toBe(4); // all four mechanics genuinely used
    for (const k of used) expect(KINDS_BY_GAME.number_city).toContain(k);
  });

  it('observe/notice captions reach moderation text and obey Arabic purity', () => {
    const spec = nature();
    const texts = collectTextFields(spec);
    expect(texts).toContain(spec.levels[1]!.observe);
    expect(texts).toContain(spec.levels[1]!.notice);
    const bad = nature();
    bad.levels[1]!.observe = 'English only caption';
    expect(validateGameSpec(bad).issues.map((i) => i.code)).toContain('LANGUAGE_PURITY');
  });
});
