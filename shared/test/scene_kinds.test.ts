/**
 * scene_play kind tests — the four OpenMind primary templates
 * (rotation_transform / cause_effect / find_fix / create_express):
 * structural schemas, every semantic issue code, text-field collection,
 * assembly (ladder + kit stamping) and the Claude-lean content schema.
 */
import { describe, expect, it } from 'vitest';
import {
  GameSpecSchema,
  ScenePlayContentSpecSchema,
  assembleSceneSpec,
  collectTextFields,
  contentSpecJsonSchema,
  repairSceneItemsJsonSchema,
  validateGameSpec,
  KIT_BY_INTEREST,
  KINDS_BY_GAME,
  LEARNING_LEVELS,
  type GameSpec,
  type Item,
  type Meta,
  type Student,
} from '../src/index.js';

// ---------------------------------------------------------------- builders

type AnyItem = Record<string, unknown>;

const rotation = (over: AnyItem = {}): AnyItem => ({
  kind: 'rotation_transform',
  id: 'r1',
  prompt: 'Turn the kite until it stands up!',
  explanation: 'You turned it the right way round.',
  hints: ['Try one more turn.'],
  concepts: ['rotation'],
  difficulty: 1,
  object: { id: 'o1', label: 'kite' },
  startAngle: 90,
  targetAngle: 0,
  snapAngle: 90,
  ...over,
});

const cause = (over: AnyItem = {}): AnyItem => ({
  kind: 'cause_effect',
  id: 'c1',
  prompt: 'Make the plant grow tall.',
  explanation: 'Plants need light to grow.',
  hints: ['Plants love brightness.'],
  concepts: ['plants'],
  difficulty: 2,
  variable: {
    label: 'light',
    settings: [
      { id: 's1', label: 'darkness' },
      { id: 's2', label: 'sunshine' },
    ],
  },
  outcomes: [
    { id: 'g1', label: 'the plant wilts' },
    { id: 'g2', label: 'the plant grows tall' },
  ],
  mapping: [
    { settingId: 's1', outcomeId: 'g1' },
    { settingId: 's2', outcomeId: 'g2' },
  ],
  goalOutcomeId: 'g2',
  ...over,
});

const fix = (over: AnyItem = {}): AnyItem => ({
  kind: 'find_fix',
  id: 'f1',
  prompt: 'Something on the shelf is wrong — find it!',
  explanation: 'Dripping things never live with the books.',
  hints: ['Look for the dripping thing.'],
  concepts: ['sorting'],
  difficulty: 3,
  objects: [
    { id: 'b1', label: 'book', mistake: false },
    { id: 'b2', label: 'notebook', mistake: false },
    { id: 'b3', label: 'wet umbrella', mistake: true, correctionId: 'k1' },
  ],
  corrections: [
    { id: 'k1', label: 'umbrella stand' },
    { id: 'k2', label: 'fridge' },
  ],
  ...over,
});

const create = (over: AnyItem = {}): AnyItem => ({
  kind: 'create_express',
  id: 'x1',
  prompt: 'Build your own garden!',
  explanation: 'What a lovely garden you made!',
  hints: ['Add anything you like.'],
  concepts: ['creativity'],
  difficulty: 2,
  palette: [
    { id: 'p1', label: 'flower' },
    { id: 'p2', label: 'tree' },
    { id: 'p3', label: 'pond' },
    { id: 'p4', label: 'bench' },
  ],
  minElements: 3,
  mustInclude: ['p1'],
  ...over,
});

function sceneSpec(): GameSpec {
  const levels = [
    { index: 0, isIntro: true, title: 'Welcome to Wonder World', teaching: [], items: [] },
    ...LEARNING_LEVELS.map((ll, i) => {
      const li = i + 1;
      return {
        index: li,
        isIntro: false,
        title: `Level ${li}`,
        learningLevel: ll,
        teaching: [{ id: `l${li}_t1`, text: 'Turning a shape does not change what it is.', emphasis: [] }],
        items: [
          rotation({ id: `l${li}_i1`, difficulty: 1 }),
          cause({ id: `l${li}_i2`, difficulty: 2 }),
          fix({ id: `l${li}_i3`, difficulty: 3 }),
          create({ id: `l${li}_i4`, difficulty: 2 }),
        ],
      };
    }),
  ];
  return GameSpecSchema.parse({
    specVersion: 1,
    meta: {
      gameType: 'scene_play',
      theme: 'wonder_world',
      subject: 'Science',
      topic: 'Plants and light',
      language: 'en',
      grade: 2,
      difficulty: 'easy',
      sessionLength: 5,
      wrapper: 'nature',
    },
    student: { name: 'Sam', color: '#079A90' },
    levels,
    summaryHints: { concepts: ['rotation', 'plants'], nextTopics: ['symmetry'] },
  });
}

/** Replace item 0 of the first educational level. */
function withItem(spec: GameSpec, item: AnyItem): GameSpec {
  const next = GameSpecSchema.parse({ ...spec });
  next.levels[1]!.items[0] = GameSpecSchema.shape.levels.element.shape.items.element.parse(item) as Item;
  return next;
}

const codes = (spec: GameSpec) => validateGameSpec(spec).issues.map((i) => i.code);

// ------------------------------------------------------------------- tests

describe('scene_play spec', () => {
  it('a fully-built scene_play session validates clean', () => {
    const r = validateGameSpec(sceneSpec());
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('registers exactly the four scene kinds for the shell', () => {
    expect([...KINDS_BY_GAME.scene_play]).toEqual([
      'rotation_transform', 'cause_effect', 'find_fix', 'create_express',
    ]);
  });

  it('requires the learning ladder', () => {
    const spec = sceneSpec();
    for (const level of spec.levels) delete level.learningLevel;
    expect(codes(spec)).toContain('LEARNING_LEVELS_REQUIRED');
  });

  it('accepts every kit and rejects foreign wrappers per game type', () => {
    for (const kit of ['nature', 'construction', 'space', 'cars', 'ocean'] as const) {
      const spec = sceneSpec();
      spec.meta.wrapper = kit;
      expect(validateGameSpec(spec).ok).toBe(true);
    }
  });

  it('rejects scene kinds hosted in a non-scene shell', () => {
    const spec = sceneSpec();
    spec.meta.gameType = 'quest_path';
    spec.meta.theme = 'fantasy';
    expect(codes(spec)).toContain('ITEM_KIND');
  });
});

describe('rotation_transform', () => {
  it('rejects angles off the snap grid', () => {
    expect(codes(withItem(sceneSpec(), rotation({ id: 'l1_i1', startAngle: 30 }))))
      .toContain('ROTATION_NOT_ON_SNAP');
  });

  it('rejects a pose with nothing to do', () => {
    expect(codes(withItem(sceneSpec(), rotation({ id: 'l1_i1', startAngle: 90, targetAngle: 90 }))))
      .toContain('ROTATION_TRIVIAL');
  });

  it('accounts for rotational symmetry: 180° on a fold-2 object is trivial', () => {
    expect(codes(withItem(sceneSpec(),
      rotation({ id: 'l1_i1', startAngle: 180, targetAngle: 0, symmetryFold: 2 }))))
      .toContain('ROTATION_TRIVIAL');
    // …while 90° on the same object is a real task.
    expect(codes(withItem(sceneSpec(),
      rotation({ id: 'l1_i1', startAngle: 90, targetAngle: 0, symmetryFold: 2 }))))
      .not.toContain('ROTATION_TRIVIAL');
  });
});

describe('cause_effect', () => {
  it('rejects an incomplete mapping (a setting double-mapped, another unmapped)', () => {
    expect(codes(withItem(sceneSpec(), cause({
      id: 'l1_i2',
      mapping: [
        { settingId: 's1', outcomeId: 'g1' },
        { settingId: 's1', outcomeId: 'g2' },
      ],
    })))).toContain('CAUSE_MAPPING_INCOMPLETE');
  });

  it('rejects a mapping to unknown ids', () => {
    expect(codes(withItem(sceneSpec(), cause({
      id: 'l1_i2',
      mapping: [
        { settingId: 's1', outcomeId: 'nope' },
        { settingId: 's2', outcomeId: 'g2' },
      ],
    })))).toContain('CAUSE_MAPPING_INCOMPLETE');
  });

  it('rejects an unknown goal outcome', () => {
    expect(codes(withItem(sceneSpec(), cause({ id: 'l1_i2', goalOutcomeId: 'nope' }))))
      .toContain('CAUSE_GOAL_UNKNOWN');
  });

  it('rejects an unreachable goal', () => {
    expect(codes(withItem(sceneSpec(), cause({
      id: 'l1_i2',
      mapping: [
        { settingId: 's1', outcomeId: 'g1' },
        { settingId: 's2', outcomeId: 'g1' },
      ],
    })))).toContain('CAUSE_GOAL_UNREACHABLE');
  });

  it('rejects an experiment every lever wins', () => {
    expect(codes(withItem(sceneSpec(), cause({
      id: 'l1_i2',
      mapping: [
        { settingId: 's1', outcomeId: 'g2' },
        { settingId: 's2', outcomeId: 'g2' },
      ],
    })))).toContain('CAUSE_TRIVIAL');
  });

  it('rejects hints that reveal the winning setting', () => {
    expect(codes(withItem(sceneSpec(),
      cause({ id: 'l1_i2', hints: ['Pick the sunshine!'] }))))
      .toContain('HINT_REVEALS_ANSWER');
  });
});

describe('find_fix', () => {
  it('rejects a scene with no mistake', () => {
    expect(codes(withItem(sceneSpec(), fix({
      id: 'l1_i3',
      objects: [
        { id: 'b1', label: 'book', mistake: false },
        { id: 'b2', label: 'notebook', mistake: false },
        { id: 'b3', label: 'pencil', mistake: false },
      ],
    })))).toContain('FIX_NO_MISTAKE');
  });

  it('rejects a scene that is all mistakes — correct context must exist', () => {
    expect(codes(withItem(sceneSpec(), fix({
      id: 'l1_i3',
      objects: [
        { id: 'b1', label: 'wet umbrella', mistake: true, correctionId: 'k1' },
        { id: 'b2', label: 'melting ice', mistake: true, correctionId: 'k2' },
        { id: 'b3', label: 'muddy boot', mistake: true, correctionId: 'k1' },
      ],
    })))).toContain('FIX_ALL_MISTAKES');
  });

  it('rejects a mistake without a known correction', () => {
    expect(codes(withItem(sceneSpec(), fix({
      id: 'l1_i3',
      objects: [
        { id: 'b1', label: 'book', mistake: false },
        { id: 'b2', label: 'notebook', mistake: false },
        { id: 'b3', label: 'wet umbrella', mistake: true },
      ],
    })))).toContain('FIX_CORRECTION_UNKNOWN');
  });

  it('rejects a correctionId on a correct object', () => {
    expect(codes(withItem(sceneSpec(), fix({
      id: 'l1_i3',
      objects: [
        { id: 'b1', label: 'book', mistake: false, correctionId: 'k2' },
        { id: 'b2', label: 'notebook', mistake: false },
        { id: 'b3', label: 'wet umbrella', mistake: true, correctionId: 'k1' },
      ],
    })))).toContain('FIX_CORRECTION_ON_OK');
  });

  it('rejects corrections without a distractor', () => {
    expect(codes(withItem(sceneSpec(), fix({
      id: 'l1_i3',
      objects: [
        { id: 'b1', label: 'book', mistake: false },
        { id: 'b2', label: 'melting ice', mistake: true, correctionId: 'k2' },
        { id: 'b3', label: 'wet umbrella', mistake: true, correctionId: 'k1' },
      ],
    })))).toContain('FIX_NO_DISTRACTOR');
  });

  it('rejects hints naming the mistake or its correction', () => {
    expect(codes(withItem(sceneSpec(),
      fix({ id: 'l1_i3', hints: ['The wet umbrella looks odd.'] }))))
      .toContain('HINT_REVEALS_ANSWER');
    expect(codes(withItem(sceneSpec(),
      fix({ id: 'l1_i3', hints: ['Maybe an umbrella stand would help?'] }))))
      .toContain('HINT_REVEALS_ANSWER');
  });
});

describe('create_express', () => {
  it('rejects a floor higher than the palette', () => {
    expect(codes(withItem(sceneSpec(), create({ id: 'l1_i4', minElements: 6 }))))
      .toContain('CREATE_MIN_TOO_HIGH');
  });

  it('rejects unknown mustInclude ids', () => {
    expect(codes(withItem(sceneSpec(), create({ id: 'l1_i4', mustInclude: ['zz'] }))))
      .toContain('CREATE_MUST_INCLUDE_UNKNOWN');
  });

  it('rejects a palette the requirements fully consume — creation means choice', () => {
    expect(codes(withItem(sceneSpec(), create({ id: 'l1_i4', minElements: 4 }))))
      .toContain('CREATE_NO_CHOICE');
  });

  it('never runs the hint-reveal check (there is no answer)', () => {
    expect(codes(withItem(sceneSpec(),
      create({ id: 'l1_i4', hints: ['A flower would look lovely.'] }))))
      .not.toContain('HINT_REVEALS_ANSWER');
  });
});

describe('text collection + assembly + lean schema', () => {
  it('collectTextFields covers every scene-kind label', () => {
    const texts = collectTextFields(sceneSpec());
    for (const s of ['kite', 'light', 'darkness', 'sunshine', 'the plant wilts',
      'wet umbrella', 'umbrella stand', 'fridge', 'flower', 'bench']) {
      expect(texts).toContain(s);
    }
  });

  it('assembleSceneSpec stamps ids, the ladder, and the interest kit', () => {
    const meta: Meta = {
      gameType: 'scene_play', theme: 'wonder_world', subject: 'Science',
      topic: 'Plants and light', language: 'en', grade: 2,
      difficulty: 'easy', sessionLength: 5,
    };
    const student: Student = { name: 'Nour', color: '#EF9722', interest: 'ocean' };
    const strip = (item: AnyItem) => { const { id: _id, ...rest } = item; return rest; };
    const content = ScenePlayContentSpecSchema.parse({
      levels: LEARNING_LEVELS.map((_, i) => ({
        title: `Level ${i + 1}`,
        observe: 'Watch the scene wake up.',
        teaching: [{ text: 'Light helps plants grow.', emphasis: [] }],
        items: [strip(rotation({ difficulty: 1 })), strip(cause({ difficulty: 2 })),
          strip(fix({ difficulty: 3 })), strip(create({ difficulty: 2 }))],
      })),
      summaryHints: { concepts: ['plants'], nextTopics: ['soil'] },
    });
    const spec = assembleSceneSpec(meta, student, content);
    expect(spec.meta.wrapper).toBe(KIT_BY_INTEREST.ocean);
    expect(spec.levels).toHaveLength(5);
    expect(spec.levels[0]!.isIntro).toBe(true);
    expect(spec.levels.slice(1).map((l) => l.learningLevel)).toEqual([...LEARNING_LEVELS]);
    expect(spec.levels[1]!.items[0]!.id).toBe('l1_i1');
    expect(spec.levels[2]!.observe).toBe('Watch the scene wake up.');
    const r = validateGameSpec(GameSpecSchema.parse(spec));
    expect(r.issues).toEqual([]);
  });

  it('an explicit meta.wrapper wins over the interest mapping', () => {
    const meta: Meta = {
      gameType: 'scene_play', theme: 'wonder_world', subject: 'Science',
      topic: 'Plants', language: 'en', grade: 2,
      difficulty: 'easy', sessionLength: 5, wrapper: 'cars',
    };
    const student: Student = { name: 'Nour', color: '#EF9722', interest: 'ocean' };
    const strip = (item: AnyItem) => { const { id: _id, ...rest } = item; return rest; };
    const content = ScenePlayContentSpecSchema.parse({
      levels: LEARNING_LEVELS.map(() => ({
        title: 'Level',
        teaching: [{ text: 'Light helps plants grow.', emphasis: [] }],
        items: [strip(rotation({ difficulty: 1 })), strip(cause({ difficulty: 2 })),
          strip(fix({ difficulty: 3 })), strip(create({ difficulty: 2 }))],
      })),
      summaryHints: { concepts: ['plants'], nextTopics: ['soil'] },
    });
    expect(assembleSceneSpec(meta, student, content).meta.wrapper).toBe('cars');
  });

  it('scene_play content + repair schemas are lean and Claude-safe', () => {
    for (const schema of [contentSpecJsonSchema('scene_play'), repairSceneItemsJsonSchema()]) {
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (node === null || typeof node !== 'object') return;
        const obj = node as Record<string, unknown>;
        if (obj.type === 'object') expect(obj.additionalProperties).toBe(false);
        for (const key of ['minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'pattern', 'default']) {
          expect(key in obj, `unsupported key "${key}" leaked into the lean schema`).toBe(false);
        }
        Object.values(obj).forEach(walk);
      };
      walk(schema);
      // The discriminated union of the four kinds must survive as anyOf.
      expect(JSON.stringify(schema)).toContain('rotation_transform');
    }
  });
});
