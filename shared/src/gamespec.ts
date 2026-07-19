/**
 * GameSpec — the contract everything revolves around.
 *
 * One Zod schema validates: hand-written demo specs, LLM-generated specs,
 * specs stored in Postgres, and specs injected into the template shells.
 * Demo specs and AI specs are the SAME format in the SAME shells — that
 * invariant is the architecture.
 *
 * Two layers of validation:
 *  1. Structural (Zod object shapes) — also exported as lean JSON Schemas
 *     for Claude structured outputs (see jsonschema.ts).
 *  2. Semantic (validateGameSpec) — cross-field rules with stable issue
 *     codes so the pipeline can do targeted repair of individual pieces.
 */
import { z } from 'zod';
import {
  ARABIC_SCRIPT_RE,
  DIAGRAM_RULES,
  DIFFICULTIES,
  GAME_TYPES,
  GRADE_MAX,
  GRADE_MIN,
  HEX_COLOR_RE,
  INTEREST_ARCHETYPES,
  KINDS_BY_GAME,
  KITS_BY_GAME,
  LANGUAGES,
  LEARNING_LEVELS,
  LIMITS,
  SPEC_VERSION,
  THEMES,
  WRAPPERS,
  edgeId,
  type GameType,
} from './constants.js';

// ---------------------------------------------------------------------------
// Leaf schemas
// ---------------------------------------------------------------------------

export const TeachCardSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(LIMITS.teachCardText),
  /** Substrings of `text` highlighted in the student's favorite color. */
  emphasis: z.array(z.string().min(1)).max(6).default([]),
});
export type TeachCard = z.infer<typeof TeachCardSchema>;

const itemCommon = {
  id: z.string().min(1),
  prompt: z.string().min(1).max(LIMITS.prompt),
  explanation: z.string().min(1).max(LIMITS.explanation),
  /** hints[0] nudges (restates the teach-card idea); hints[1] narrows
   *  (eliminates an option / pulses a diagram region). Never the answer. */
  hints: z.array(z.string().min(1).max(LIMITS.hint)).min(LIMITS.hintsMin).max(LIMITS.hintsMax),
  concepts: z.array(z.string().min(1)).min(1).max(4),
  difficulty: z.number().int().min(1).max(5),
};

export const McqItemSchema = z.object({
  kind: z.literal('mcq'),
  ...itemCommon,
  options: z.array(z.string().min(1).max(LIMITS.option)).length(4),
  correctIndex: z.number().int().min(0).max(3),
});
export type McqItem = z.infer<typeof McqItemSchema>;

export const ConnectItemSchema = z.object({
  kind: z.literal('connect'),
  ...itemCommon,
  /** Diagram edge ids ("from->to") the student must draw for this item. */
  edgeIds: z.array(z.string().min(1)).min(1).max(6),
});
export type ConnectItem = z.infer<typeof ConnectItemSchema>;

// ---- scene-based learning kinds (interaction before explanation) -----------
// Evaluation is 100% programmatic against this canonical data; wrappers only
// re-skin presentation and can never change it.

/** One object living in a scene. `correct` marks it as part of the answer. */
export const SceneObjectSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(LIMITS.sceneObjectLabel),
  correct: z.boolean(),
});
export type SceneObject = z.infer<typeof SceneObjectSchema>;

/** Tap every correct object in the scene (recognize/count from a scene). */
export const TapSceneItemSchema = z.object({
  kind: z.literal('tap_scene'),
  ...itemCommon,
  objects: z.array(SceneObjectSchema).min(LIMITS.sceneObjectsMin).max(LIMITS.sceneObjectsMax),
});
export type TapSceneItem = z.infer<typeof TapSceneItemSchema>;

/** Drag every correct object into the container (collect/combine groups). */
export const DragCollectItemSchema = z.object({
  kind: z.literal('drag_collect'),
  ...itemCommon,
  containerLabel: z.string().min(1).max(LIMITS.containerLabel),
  objects: z.array(SceneObjectSchema).min(LIMITS.sceneObjectsMin).max(LIMITS.sceneObjectsMax),
});
export type DragCollectItem = z.infer<typeof DragCollectItemSchema>;

/** Arrange the steps into order. The ARRAY ORDER is the canonical answer —
 *  shells must shuffle presentation (same rule match_pairs uses). */
export const SequenceItemSchema = z.object({
  kind: z.literal('sequence'),
  ...itemCommon,
  steps: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1).max(LIMITS.sequenceStepLabel),
  })).min(LIMITS.sequenceStepsMin).max(LIMITS.sequenceStepsMax),
});
export type SequenceItem = z.infer<typeof SequenceItemSchema>;

/** Complete a structure: pieces in reading order, gap pieces are hidden and
 *  filled from the options (each gap's own label is its correct answer;
 *  extra options are distractors). */
export const BuildCompleteItemSchema = z.object({
  kind: z.literal('build_complete'),
  ...itemCommon,
  pieces: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1).max(LIMITS.buildPieceLabel),
    gap: z.boolean(),
  })).min(LIMITS.buildPiecesMin).max(LIMITS.buildPiecesMax),
  options: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1).max(LIMITS.buildPieceLabel),
  })).min(LIMITS.buildOptionsMin).max(LIMITS.buildOptionsMax),
});
export type BuildCompleteItem = z.infer<typeof BuildCompleteItemSchema>;

// ---- scene_play living-scene kinds ------------------------------------------
// The four OpenMind primary templates the AI fills with pure JSON. Rendering
// is 100% kit-drawn (SceneKit visual tables); evaluation is 100% programmatic.

/** Rotate an object (by snapAngle taps) until it matches the target pose.
 *  The match check is `angle ≡ targetAngle (mod 360/symmetryFold)`. */
export const RotationTransformItemSchema = z.object({
  kind: z.literal('rotation_transform'),
  ...itemCommon,
  object: z.object({
    id: z.string().min(1),
    /** SceneKit.visualFor(label) picks the drawn visual; unknown → chip. */
    label: z.string().min(1).max(LIMITS.rotationLabel),
  }),
  /** Degrees, multiples of snapAngle. */
  startAngle: z.number().int().min(0).max(359),
  targetAngle: z.number().int().min(0).max(359),
  /** One arrow tap rotates by this step. */
  snapAngle: z.union([z.literal(45), z.literal(90)]),
  /** Rotational symmetry: fold-2 looks identical every 180° (default 1). */
  symmetryFold: z.number().int().min(1).max(4).optional(),
});
export type RotationTransformItem = z.infer<typeof RotationTransformItemSchema>;

/** Set ONE variable, run the experiment, watch the mapped outcome play out.
 *  Learning by experiment: a non-goal outcome is information, not failure. */
export const CauseEffectItemSchema = z.object({
  kind: z.literal('cause_effect'),
  ...itemCommon,
  variable: z.object({
    label: z.string().min(1).max(LIMITS.causeVariableLabel),
    settings: z.array(z.object({
      id: z.string().min(1),
      label: z.string().min(1).max(LIMITS.causeSettingLabel),
    })).min(LIMITS.causeSettingsMin).max(LIMITS.causeSettingsMax),
  }),
  outcomes: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1).max(LIMITS.causeOutcomeLabel),
  })).min(LIMITS.causeOutcomesMin).max(LIMITS.causeOutcomesMax),
  /** Total function: every setting maps to exactly one outcome. */
  mapping: z.array(z.object({
    settingId: z.string().min(1),
    outcomeId: z.string().min(1),
  })).min(LIMITS.causeSettingsMin).max(LIMITS.causeSettingsMax),
  goalOutcomeId: z.string().min(1),
});
export type CauseEffectItem = z.infer<typeof CauseEffectItemSchema>;

/** Spot the mistaken objects in a scene, then pick each one's correction.
 *  Mistake objects MUST carry correctionId; correct objects must not. */
export const FindFixItemSchema = z.object({
  kind: z.literal('find_fix'),
  ...itemCommon,
  objects: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1).max(LIMITS.fixObjectLabel),
    mistake: z.boolean(),
    correctionId: z.string().min(1).optional(),
  })).min(LIMITS.fixObjectsMin).max(LIMITS.fixObjectsMax),
  /** Fix options — includes ≥1 distractor beyond the real corrections. */
  corrections: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1).max(LIMITS.fixObjectLabel),
  })).min(LIMITS.fixCorrectionsMin).max(LIMITS.fixCorrectionsMax),
});
export type FindFixItem = z.infer<typeof FindFixItemSchema>;

/** Open-ended creation with soft goals. Celebrated, NEVER scored: the shell
 *  resolves it with an `expressive` result that bypasses accuracy/mastery.
 *  `prompt` is the creative goal; `explanation` the celebration line. */
export const CreateExpressItemSchema = z.object({
  kind: z.literal('create_express'),
  ...itemCommon,
  /** Stampable elements (kit-drawn). Creation must involve choice. */
  palette: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1).max(LIMITS.createElementLabel),
  })).min(LIMITS.createPaletteMin).max(LIMITS.createPaletteMax),
  /** Soft completion floor: FINISH enables at this many placed elements. */
  minElements: z.number().int().min(1).max(LIMITS.createMinElementsMax),
  /** Soft requirements: palette element ids that must appear at least once. */
  mustInclude: z.array(z.string().min(1)).max(3).default([]),
});
export type CreateExpressItem = z.infer<typeof CreateExpressItemSchema>;

export const ItemSchema = z.discriminatedUnion('kind', [
  McqItemSchema,
  ConnectItemSchema,
  TapSceneItemSchema,
  DragCollectItemSchema,
  SequenceItemSchema,
  BuildCompleteItemSchema,
  RotationTransformItemSchema,
  CauseEffectItemSchema,
  FindFixItemSchema,
  CreateExpressItemSchema,
]);
export type Item = z.infer<typeof ItemSchema>;

export const LevelSchema = z.object({
  index: z.number().int().min(0),
  isIntro: z.boolean(),
  title: z.string().min(1).max(LIMITS.levelTitle),
  /** Learning-ladder tag. When a session uses the ladder, its educational
   *  levels carry exactly recognize → understand → apply → challenge in
   *  order (enforced semantically). Absent for classic game sessions. */
  learningLevel: z.enum(LEARNING_LEVELS).optional(),
  /** Six-beat flow captions (observe → try → notice → explain → practice →
   *  checkpoint). `observe` opens the level before any interaction; `notice`
   *  names the pattern right after the first try. Canonical learning content:
   *  identical across wrappers, which only re-skin the scene around them. */
  observe: z.string().min(1).max(LIMITS.beatCaption).optional(),
  notice: z.string().min(1).max(LIMITS.beatCaption).optional(),
  teaching: z.array(TeachCardSchema).max(LIMITS.teachCardsMax),
  items: z.array(ItemSchema).max(LIMITS.itemsPerLevelMax),
});
export type Level = z.infer<typeof LevelSchema>;

export const DiagramNodeSchema = z.object({
  id: z.string().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  label: z.string().min(1).max(LIMITS.nodeLabel),
  kind: z.enum(['point', 'label', 'icon']),
  iconKey: z.string().min(1).optional(),
});
export type DiagramNode = z.infer<typeof DiagramNodeSchema>;

export const DiagramEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type DiagramEdge = z.infer<typeof DiagramEdgeSchema>;

export const DiagramSchema = z.object({
  nodes: z.array(DiagramNodeSchema).min(DIAGRAM_RULES.minNodes).max(DIAGRAM_RULES.maxNodes),
  /** The VALID connections. Evaluation is programmatic, never AI vision. */
  edges: z.array(DiagramEdgeSchema).min(DIAGRAM_RULES.minValidEdges),
  /** Nodes that connect to nothing (decoys). */
  distractorNodeIds: z.array(z.string().min(1)).min(DIAGRAM_RULES.minDistractors),
});
export type Diagram = z.infer<typeof DiagramSchema>;

export const NarrativeSchema = z.object({
  intro: z.string().min(1).max(LIMITS.narrativeIntro),
  outro: z.string().min(1).max(LIMITS.narrativeOutro),
  /** One flavor line per EDUCATIONAL level (intro level excluded). */
  perLevel: z.array(z.string().min(1).max(LIMITS.narrativePerLevel)),
});
export type Narrative = z.infer<typeof NarrativeSchema>;

export const MetaSchema = z.object({
  gameType: z.enum(GAME_TYPES),
  theme: z.string().min(1),
  subject: z.string().min(1).max(80),
  topic: z.string().min(1).max(120),
  language: z.enum(LANGUAGES),
  grade: z.number().int().min(GRADE_MIN).max(GRADE_MAX),
  /** Starting baseline only — the AdaptiveEngine moves from here. */
  difficulty: z.enum(DIFFICULTIES),
  sessionLength: z.union([z.literal(3), z.literal(5), z.literal(7)]),
  /** Digit rendering for Arabic. Defaults to arabic_indic when language=ar. */
  numerals: z.enum(['western', 'arabic_indic']).optional(),
  /** Curriculum concept this experience teaches (e.g. "add_within_10").
   *  Rides every learning-evidence event; absent for free-topic games. */
  conceptId: z.string().min(1).max(60).optional(),
  /** Interest wrapper: presentation skin only — never content, difficulty,
   *  verification or evidence (see WRAPPERS in constants). */
  wrapper: z.enum(WRAPPERS).optional(),
});
export type Meta = z.infer<typeof MetaSchema>;

export const StudentSchema = z.object({
  /** Nickname only — never a real-name field (minors). */
  name: z.string().min(1).max(LIMITS.studentName),
  /** Used ONLY for Arabic gendered grammar. Never anything else. */
  gender: z.enum(['m', 'f']).nullable().optional(),
  /** Favorite color — the accent everywhere. */
  color: z.string().regex(HEX_COLOR_RE),
  /** Interest archetype id → programmatic companion sprite. */
  interest: z.enum(INTEREST_ARCHETYPES).optional(),
});
export type Student = z.infer<typeof StudentSchema>;

export const SummaryHintsSchema = z.object({
  concepts: z.array(z.string().min(1)).min(1).max(8),
  nextTopics: z.array(z.string().min(1)).min(1).max(5),
});
export type SummaryHints = z.infer<typeof SummaryHintsSchema>;

// ---------------------------------------------------------------------------
// GameSpec (full, as stored/served) and StubSpec (progressive start)
// ---------------------------------------------------------------------------

export const GameSpecSchema = z.object({
  specVersion: z.literal(SPEC_VERSION),
  /** Present (true) only on progressive-start stubs — full specs omit it. */
  stub: z.literal(false).optional(),
  meta: MetaSchema,
  student: StudentSchema,
  narrative: NarrativeSchema.optional(),
  levels: z.array(LevelSchema).min(1),
  diagram: DiagramSchema.optional(),
  summaryHints: SummaryHintsSchema,
});
export type GameSpec = z.infer<typeof GameSpecSchema>;

/**
 * Stub spec for progressive start: everything the shell needs to run the
 * built-in tutorial level is known before generation begins.
 */
export const StubSpecSchema = z.object({
  specVersion: z.literal(SPEC_VERSION),
  stub: z.literal(true),
  meta: MetaSchema,
  student: StudentSchema,
  levels: z.array(LevelSchema).max(0),
});
export type StubSpec = z.infer<typeof StubSpecSchema>;

// ---------------------------------------------------------------------------
// ContentSpec — what the LLM actually generates (meta/student are known;
// the intro level is built into the shells; ids are assigned server-side).
// ---------------------------------------------------------------------------

export const GeneratedTeachCardSchema = TeachCardSchema.omit({ id: true });
export const GeneratedMcqItemSchema = McqItemSchema.omit({ id: true, kind: true });
export const GeneratedConnectItemSchema = ConnectItemSchema.omit({ id: true, kind: true });

export const GeneratedMcqLevelSchema = z.object({
  title: z.string().min(1).max(LIMITS.levelTitle),
  teaching: z.array(GeneratedTeachCardSchema).min(LIMITS.teachCardsMin).max(LIMITS.teachCardsMax),
  items: z.array(GeneratedMcqItemSchema).min(LIMITS.itemsPerLevelMin).max(LIMITS.itemsPerLevelMax),
});
export const GeneratedConnectLevelSchema = z.object({
  title: z.string().min(1).max(LIMITS.levelTitle),
  teaching: z.array(GeneratedTeachCardSchema).min(LIMITS.teachCardsMin).max(LIMITS.teachCardsMax),
  items: z.array(GeneratedConnectItemSchema).min(LIMITS.itemsPerLevelMin).max(LIMITS.itemsPerLevelMax),
});

/** LLM output for quest_path / goal_shootout. */
export const McqContentSpecSchema = z.object({
  narrative: NarrativeSchema,
  levels: z.array(GeneratedMcqLevelSchema).min(2).max(6),
  summaryHints: SummaryHintsSchema,
});
export type McqContentSpec = z.infer<typeof McqContentSpecSchema>;

/** LLM output for draw_connect. */
export const ConnectContentSpecSchema = z.object({
  narrative: NarrativeSchema.optional(),
  diagram: DiagramSchema,
  levels: z.array(GeneratedConnectLevelSchema).min(2).max(6),
  summaryHints: SummaryHintsSchema,
});
export type ConnectContentSpec = z.infer<typeof ConnectContentSpecSchema>;

// ---- scene_play generated content -------------------------------------------
// Unlike mcq/connect content (single-kind, kind stamped at assembly),
// scene_play levels MIX kinds, so generated items keep `kind` as the
// discriminator and only omit `id`. The assembler stamps ids AND the
// learning ladder (recognize → understand → apply → challenge, by index).

export const GeneratedSceneItemSchema = z.discriminatedUnion('kind', [
  RotationTransformItemSchema.omit({ id: true }),
  CauseEffectItemSchema.omit({ id: true }),
  FindFixItemSchema.omit({ id: true }),
  CreateExpressItemSchema.omit({ id: true }),
]);
export type GeneratedSceneItem = z.infer<typeof GeneratedSceneItemSchema>;

export const GeneratedSceneLevelSchema = z.object({
  title: z.string().min(1).max(LIMITS.levelTitle),
  observe: z.string().min(1).max(LIMITS.beatCaption).optional(),
  notice: z.string().min(1).max(LIMITS.beatCaption).optional(),
  teaching: z.array(GeneratedTeachCardSchema).min(LIMITS.teachCardsMin).max(LIMITS.teachCardsMax),
  items: z.array(GeneratedSceneItemSchema).min(LIMITS.itemsPerLevelMin).max(LIMITS.itemsPerLevelMax),
});

/** LLM output for scene_play. Exactly 4 levels — the learning ladder. */
export const ScenePlayContentSpecSchema = z.object({
  narrative: NarrativeSchema.optional(),
  levels: z.array(GeneratedSceneLevelSchema).length(LEARNING_LEVELS.length),
  summaryHints: SummaryHintsSchema,
});
export type ScenePlayContentSpec = z.infer<typeof ScenePlayContentSpecSchema>;

// ---------------------------------------------------------------------------
// Semantic validation with stable issue codes (powers targeted repair)
// ---------------------------------------------------------------------------

export interface SpecIssue {
  code: string;
  /** Pointer to the failing piece, e.g. "levels[2].items[1]" or "diagram". */
  path: string;
  message: string;
  /** Id of the item/card the issue belongs to, when addressable. */
  targetId?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: SpecIssue[];
}

function pushIssue(issues: SpecIssue[], code: string, path: string, message: string, targetId?: string) {
  issues.push(targetId ? { code, path, message, targetId } : { code, path, message });
}

function hasArabic(s: string): boolean {
  return ARABIC_SCRIPT_RE.test(s);
}

/** Collects every user-visible content string of a spec (for moderation / language checks). */
export function collectTextFields(spec: GameSpec): string[] {
  const out: string[] = [spec.meta.subject, spec.meta.topic];
  if (spec.narrative) out.push(spec.narrative.intro, spec.narrative.outro, ...spec.narrative.perLevel);
  for (const level of spec.levels) {
    out.push(level.title);
    if (level.observe) out.push(level.observe);
    if (level.notice) out.push(level.notice);
    for (const t of level.teaching) out.push(t.text);
    for (const item of level.items) {
      out.push(item.prompt, item.explanation, ...item.hints);
      if (item.kind === 'mcq') out.push(...item.options);
      if (item.kind === 'tap_scene') out.push(...item.objects.map((o) => o.label));
      if (item.kind === 'drag_collect') {
        out.push(item.containerLabel, ...item.objects.map((o) => o.label));
      }
      if (item.kind === 'sequence') out.push(...item.steps.map((s) => s.label));
      if (item.kind === 'build_complete') {
        out.push(...item.pieces.map((pc) => pc.label), ...item.options.map((o) => o.label));
      }
      if (item.kind === 'rotation_transform') out.push(item.object.label);
      if (item.kind === 'cause_effect') {
        out.push(item.variable.label,
          ...item.variable.settings.map((s) => s.label),
          ...item.outcomes.map((o) => o.label));
      }
      if (item.kind === 'find_fix') {
        out.push(...item.objects.map((o) => o.label), ...item.corrections.map((c) => c.label));
      }
      if (item.kind === 'create_express') out.push(...item.palette.map((p) => p.label));
    }
  }
  if (spec.diagram) for (const n of spec.diagram.nodes) out.push(n.label);
  out.push(...spec.summaryHints.concepts, ...spec.summaryHints.nextTopics);
  return out.filter((s) => s && s.trim().length > 0);
}

/**
 * Full semantic validation of a complete GameSpec.
 * Assumes structural (Zod) validation already passed — call safeParse first
 * or use parseAndValidateGameSpec below.
 */
export function validateGameSpec(spec: GameSpec): ValidationResult {
  const issues: SpecIssue[] = [];
  const { meta } = spec;

  // Theme belongs to the game type.
  const themes = THEMES[meta.gameType];
  if (!themes.includes(meta.theme)) {
    pushIssue(issues, 'THEME_INVALID', 'meta.theme',
      `theme "${meta.theme}" is not one of [${themes.join(', ')}] for ${meta.gameType}`);
  }

  // Interest kit belongs to the game type (KITS_BY_GAME, one table).
  if (meta.wrapper) {
    const kits = KITS_BY_GAME[meta.gameType];
    if (!kits.includes(meta.wrapper)) {
      pushIssue(issues, 'WRAPPER_INVALID', 'meta.wrapper',
        `wrapper "${meta.wrapper}" is not one of [${kits.join(', ')}] for ${meta.gameType}`);
    }
  }

  // Level count matches sessionLength.
  if (spec.levels.length !== meta.sessionLength) {
    pushIssue(issues, 'LEVEL_COUNT', 'levels',
      `expected ${meta.sessionLength} levels (intro + ${meta.sessionLength - 1} educational), got ${spec.levels.length}`);
  }

  // Indices sequential.
  spec.levels.forEach((level, i) => {
    if (level.index !== i) {
      pushIssue(issues, 'LEVEL_INDEX', `levels[${i}].index`, `expected index ${i}, got ${level.index}`);
    }
  });

  // Intro level: always first, always empty of educational content.
  const intro = spec.levels[0];
  if (intro) {
    if (!intro.isIntro) pushIssue(issues, 'INTRO_FLAG', 'levels[0].isIntro', 'levels[0].isIntro must be true');
    if (intro.items.length > 0) {
      pushIssue(issues, 'INTRO_HAS_ITEMS', 'levels[0].items', 'the intro level must have zero items');
    }
    if (intro.teaching.length > 0) {
      pushIssue(issues, 'INTRO_HAS_TEACHING', 'levels[0].teaching', 'the intro level must have zero teach cards');
    }
  }

  // Educational levels.
  const ids = new Set<string>();
  spec.levels.forEach((level, li) => {
    if (li === 0) return;
    const p = `levels[${li}]`;
    if (level.isIntro) pushIssue(issues, 'EXTRA_INTRO', `${p}.isIntro`, 'only levels[0] may be the intro');
    if (level.teaching.length < LIMITS.teachCardsMin) {
      pushIssue(issues, 'TEACH_MISSING', `${p}.teaching`,
        `educational levels need ${LIMITS.teachCardsMin}–${LIMITS.teachCardsMax} teach cards`);
    }
    if (level.items.length < LIMITS.itemsPerLevelMin || level.items.length > LIMITS.itemsPerLevelMax) {
      pushIssue(issues, 'ITEM_COUNT', `${p}.items`,
        `educational levels need ${LIMITS.itemsPerLevelMin}–${LIMITS.itemsPerLevelMax} items, got ${level.items.length}`);
    }
    const bands = new Set(level.items.map((it) => it.difficulty));
    if (level.items.length > 0 && bands.size < 2) {
      pushIssue(issues, 'DIFFICULTY_BANDS', `${p}.items`,
        'items must span ≥2 difficulty bands so the adaptive engine has material');
    }

    level.items.forEach((item, ii) => {
      const ip = `${p}.items[${ii}]`;
      if (ids.has(item.id)) pushIssue(issues, 'DUPLICATE_ID', `${ip}.id`, `duplicate item id "${item.id}"`, item.id);
      ids.add(item.id);

      // Kind must be one this shell renders (KINDS_BY_GAME, not a ternary —
      // the Number City shell registers its four kinds in that one table).
      const allowedKinds = KINDS_BY_GAME[meta.gameType];
      if (!allowedKinds.includes(item.kind)) {
        pushIssue(issues, 'ITEM_KIND', `${ip}.kind`,
          `${meta.gameType} items must be one of [${allowedKinds.join(', ')}], got "${item.kind}"`, item.id);
      }

      if (item.kind === 'mcq') {
        const uniq = new Set(item.options.map((o) => o.trim().toLowerCase()));
        if (uniq.size !== 4) {
          pushIssue(issues, 'OPTIONS_NOT_UNIQUE', `${ip}.options`, 'the 4 options must be unique', item.id);
        }
        checkHintsDontReveal(issues, ip, item, [item.options[item.correctIndex] ?? '']);
      }

      if (item.kind === 'connect') {
        if (!spec.diagram) {
          pushIssue(issues, 'DIAGRAM_MISSING', `${ip}.edgeIds`, 'connect items require a diagram', item.id);
        } else {
          const validEdgeIds = new Set(spec.diagram.edges.map((e) => edgeId(e.from, e.to)));
          for (const eid of item.edgeIds) {
            if (!validEdgeIds.has(eid)) {
              pushIssue(issues, 'EDGE_ID_UNKNOWN', `${ip}.edgeIds`,
                `edge id "${eid}" does not exist in diagram.edges`, item.id);
            }
          }
        }
      }

      if (item.kind === 'tap_scene' || item.kind === 'drag_collect') {
        validateSceneObjects(issues, ip, item.id, item.objects);
        checkHintsDontReveal(issues, ip, item,
          item.objects.filter((o) => o.correct).map((o) => o.label));
      }

      if (item.kind === 'sequence') {
        const stepIds = new Set(item.steps.map((s) => s.id));
        const stepLabels = new Set(item.steps.map((s) => s.label.trim().toLowerCase()));
        if (stepIds.size !== item.steps.length || stepLabels.size !== item.steps.length) {
          pushIssue(issues, 'SEQUENCE_STEPS_NOT_UNIQUE', `${ip}.steps`,
            'sequence step ids and labels must be unique', item.id);
        }
      }

      if (item.kind === 'build_complete') {
        validateBuildComplete(issues, ip, item);
        checkHintsDontReveal(issues, ip, item,
          item.pieces.filter((pc) => pc.gap).map((pc) => pc.label));
      }

      if (item.kind === 'rotation_transform') {
        validateRotationTransform(issues, ip, item);
      }

      if (item.kind === 'cause_effect') {
        validateCauseEffect(issues, ip, item);
        // The winning setting's label must not leak through hints.
        const winningLabels = item.variable.settings
          .filter((s) => item.mapping.some((m) => m.settingId === s.id && m.outcomeId === item.goalOutcomeId))
          .map((s) => s.label);
        checkHintsDontReveal(issues, ip, item, winningLabels);
      }

      if (item.kind === 'find_fix') {
        validateFindFix(issues, ip, item);
        const correctionById = new Map(item.corrections.map((c) => [c.id, c.label]));
        const revealing = item.objects
          .filter((o) => o.mistake)
          .flatMap((o) => [o.label, ...(o.correctionId ? [correctionById.get(o.correctionId) ?? ''] : [])]);
        checkHintsDontReveal(issues, ip, item, revealing);
      }

      // create_express has no correct answer — nothing for hints to reveal.
      if (item.kind === 'create_express') {
        validateCreateExpress(issues, ip, item);
      }

      // Language purity per item.
      const textBlob = [item.prompt, item.explanation, ...item.hints,
        ...(item.kind === 'mcq' ? item.options : []),
        ...(item.kind === 'cause_effect'
          ? [item.variable.label, ...item.variable.settings.map((s) => s.label),
             ...item.outcomes.map((o) => o.label)] : []),
        ...(item.kind === 'find_fix'
          ? [...item.objects.map((o) => o.label), ...item.corrections.map((c) => c.label)] : []),
        ...(item.kind === 'create_express' ? item.palette.map((p) => p.label) : [])].join(' ');
      if (meta.language === 'ar' && !hasArabic(textBlob)) {
        pushIssue(issues, 'LANGUAGE_PURITY', ip, 'Arabic spec item contains no Arabic script', item.id);
      }
    });
  });

  validateLearningLadder(issues, spec);

  // Narrative rules.
  if (meta.gameType === 'quest_path') {
    if (!spec.narrative) {
      pushIssue(issues, 'NARRATIVE_MISSING', 'narrative', 'quest_path requires a narrative');
    } else if (spec.narrative.perLevel.length !== meta.sessionLength - 1) {
      pushIssue(issues, 'NARRATIVE_PER_LEVEL', 'narrative.perLevel',
        `perLevel must have one entry per educational level (${meta.sessionLength - 1})`);
    }
  }

  // Language purity for teach cards + narrative.
  if (meta.language === 'ar') {
    spec.levels.forEach((level, li) => {
      level.teaching.forEach((t, ti) => {
        if (!hasArabic(t.text)) {
          pushIssue(issues, 'LANGUAGE_PURITY', `levels[${li}].teaching[${ti}]`,
            'Arabic teach card contains no Arabic script', t.id);
        }
      });
      for (const beat of ['observe', 'notice'] as const) {
        const caption = level[beat];
        if (caption && !hasArabic(caption)) {
          pushIssue(issues, 'LANGUAGE_PURITY', `levels[${li}].${beat}`,
            `Arabic ${beat} caption contains no Arabic script`);
        }
      }
    });
    if (spec.narrative && !hasArabic(spec.narrative.intro)) {
      pushIssue(issues, 'LANGUAGE_PURITY', 'narrative.intro', 'Arabic narrative contains no Arabic script');
    }
  }

  // Diagram rules (draw_connect).
  if (meta.gameType === 'draw_connect') {
    if (!spec.diagram) {
      pushIssue(issues, 'DIAGRAM_MISSING', 'diagram', 'draw_connect requires a diagram');
    } else {
      validateDiagram(spec.diagram, issues);
    }
  } else if (spec.diagram) {
    pushIssue(issues, 'DIAGRAM_UNEXPECTED', 'diagram', `${meta.gameType} must not carry a diagram`);
  }

  return { ok: issues.length === 0, issues };
}

/** Hints must never contain a correct answer verbatim (skip answers <3
 *  chars — a hint containing "٢" is not a reveal). Shared by every kind. */
function checkHintsDontReveal(issues: SpecIssue[], ip: string, item: Item, answers: string[]) {
  const needles = answers.map((a) => a.trim().toLowerCase()).filter((a) => a.length >= 3);
  if (!needles.length) return;
  item.hints.forEach((h, hi) => {
    const hint = h.toLowerCase();
    if (needles.some((n) => hint.includes(n))) {
      pushIssue(issues, 'HINT_REVEALS_ANSWER', `${ip}.hints[${hi}]`,
        'hint contains a correct answer verbatim', item.id);
    }
  });
}

/** tap_scene / drag_collect: unique object ids, ≥1 correct, ≥1 distractor. */
function validateSceneObjects(issues: SpecIssue[], ip: string, itemId: string, objects: SceneObject[]) {
  const objIds = new Set(objects.map((o) => o.id));
  if (objIds.size !== objects.length) {
    pushIssue(issues, 'DUPLICATE_ID', `${ip}.objects`, 'scene object ids must be unique', itemId);
  }
  if (!objects.some((o) => o.correct)) {
    pushIssue(issues, 'SCENE_NO_CORRECT', `${ip}.objects`, 'at least one scene object must be correct', itemId);
  }
  if (!objects.some((o) => !o.correct)) {
    pushIssue(issues, 'SCENE_NO_DISTRACTOR', `${ip}.objects`,
      'at least one scene object must be a distractor — tapping everything must not win', itemId);
  }
}

/** build_complete: ≥1 gap but never all gaps; every gap label has exactly
 *  one matching option; ≥1 distractor option; unique ids and labels. */
function validateBuildComplete(issues: SpecIssue[], ip: string, item: BuildCompleteItem) {
  const gaps = item.pieces.filter((pc) => pc.gap);
  if (gaps.length === 0) {
    pushIssue(issues, 'BUILD_NO_GAP', `${ip}.pieces`, 'build_complete needs at least one gap piece', item.id);
  }
  if (gaps.length === item.pieces.length) {
    pushIssue(issues, 'BUILD_ALL_GAPS', `${ip}.pieces`,
      'build_complete must show some given pieces — a structure that is all gaps teaches nothing', item.id);
  }
  const pieceIds = new Set(item.pieces.map((pc) => pc.id));
  const optionIds = new Set(item.options.map((o) => o.id));
  if (pieceIds.size !== item.pieces.length || optionIds.size !== item.options.length) {
    pushIssue(issues, 'DUPLICATE_ID', `${ip}`, 'piece and option ids must be unique', item.id);
  }
  const optionLabels = item.options.map((o) => o.label.trim().toLowerCase());
  if (new Set(optionLabels).size !== optionLabels.length) {
    pushIssue(issues, 'OPTIONS_NOT_UNIQUE', `${ip}.options`, 'option labels must be unique', item.id);
  }
  let matched = 0;
  for (const gap of gaps) {
    const hits = optionLabels.filter((l) => l === gap.label.trim().toLowerCase()).length;
    if (hits === 0) {
      pushIssue(issues, 'BUILD_OPTION_MISSING', `${ip}.options`,
        `no option matches gap "${gap.label}"`, item.id);
    } else {
      matched++;
    }
  }
  if (item.options.length <= matched) {
    pushIssue(issues, 'BUILD_NO_DISTRACTOR', `${ip}.options`,
      'options must include at least one distractor beyond the gap answers', item.id);
  }
}

/** rotation_transform: angles on the snap grid, and actually something to do
 *  once rotational symmetry is accounted for. */
function validateRotationTransform(issues: SpecIssue[], ip: string, item: RotationTransformItem) {
  if (item.startAngle % item.snapAngle !== 0 || item.targetAngle % item.snapAngle !== 0) {
    pushIssue(issues, 'ROTATION_NOT_ON_SNAP', `${ip}`,
      `startAngle/targetAngle must be multiples of snapAngle ${item.snapAngle}`, item.id);
  }
  const fold = item.symmetryFold ?? 1;
  const period = 360 / fold;
  const delta = ((item.targetAngle - item.startAngle) % period + period) % period;
  if (delta === 0) {
    pushIssue(issues, 'ROTATION_TRIVIAL', `${ip}`,
      `start and target poses look identical (symmetryFold ${fold}) — nothing to rotate`, item.id);
  }
}

/** cause_effect: mapping is a total function over settings, goal exists, is
 *  reachable, and is NOT reached by every setting (flipping any lever must
 *  not win — the experiment has to discriminate). */
function validateCauseEffect(issues: SpecIssue[], ip: string, item: CauseEffectItem) {
  const settingIds = new Set(item.variable.settings.map((s) => s.id));
  const outcomeIds = new Set(item.outcomes.map((o) => o.id));
  if (settingIds.size !== item.variable.settings.length || outcomeIds.size !== item.outcomes.length) {
    pushIssue(issues, 'DUPLICATE_ID', `${ip}`, 'setting and outcome ids must be unique', item.id);
  }
  const mappedSettings = new Set<string>();
  for (const m of item.mapping) {
    if (!settingIds.has(m.settingId) || !outcomeIds.has(m.outcomeId)) {
      pushIssue(issues, 'CAUSE_MAPPING_INCOMPLETE', `${ip}.mapping`,
        `mapping references unknown id ("${m.settingId}" → "${m.outcomeId}")`, item.id);
    }
    if (mappedSettings.has(m.settingId)) {
      pushIssue(issues, 'CAUSE_MAPPING_INCOMPLETE', `${ip}.mapping`,
        `setting "${m.settingId}" is mapped more than once`, item.id);
    }
    mappedSettings.add(m.settingId);
  }
  for (const s of item.variable.settings) {
    if (!mappedSettings.has(s.id)) {
      pushIssue(issues, 'CAUSE_MAPPING_INCOMPLETE', `${ip}.mapping`,
        `setting "${s.id}" has no outcome — the mapping must cover every setting`, item.id);
    }
  }
  if (!outcomeIds.has(item.goalOutcomeId)) {
    pushIssue(issues, 'CAUSE_GOAL_UNKNOWN', `${ip}.goalOutcomeId`,
      `goal outcome "${item.goalOutcomeId}" is not one of the outcomes`, item.id);
    return;
  }
  const goalHits = item.mapping.filter((m) => m.outcomeId === item.goalOutcomeId).length;
  if (goalHits === 0) {
    pushIssue(issues, 'CAUSE_GOAL_UNREACHABLE', `${ip}.mapping`,
      'no setting reaches the goal outcome', item.id);
  }
  if (goalHits >= item.variable.settings.length) {
    pushIssue(issues, 'CAUSE_TRIVIAL', `${ip}.mapping`,
      'every setting reaches the goal — the experiment must discriminate', item.id);
  }
}

/** find_fix: ≥1 mistake but never all (correct context must exist), every
 *  mistake carries a known correction, corrections include ≥1 distractor. */
function validateFindFix(issues: SpecIssue[], ip: string, item: FindFixItem) {
  const objIds = new Set(item.objects.map((o) => o.id));
  const corrIds = new Set(item.corrections.map((c) => c.id));
  if (objIds.size !== item.objects.length || corrIds.size !== item.corrections.length) {
    pushIssue(issues, 'DUPLICATE_ID', `${ip}`, 'object and correction ids must be unique', item.id);
  }
  const mistakes = item.objects.filter((o) => o.mistake);
  if (mistakes.length === 0) {
    pushIssue(issues, 'FIX_NO_MISTAKE', `${ip}.objects`,
      'find_fix needs at least one mistaken object', item.id);
  }
  if (mistakes.length > LIMITS.fixMistakesMax || mistakes.length === item.objects.length) {
    pushIssue(issues, 'FIX_ALL_MISTAKES', `${ip}.objects`,
      `at most ${LIMITS.fixMistakesMax} mistakes and never all objects — the scene needs correct context`, item.id);
  }
  const usedCorrections = new Set<string>();
  for (const o of item.objects) {
    if (o.mistake) {
      if (!o.correctionId || !corrIds.has(o.correctionId)) {
        pushIssue(issues, 'FIX_CORRECTION_UNKNOWN', `${ip}.objects`,
          `mistake "${o.id}" must carry a correctionId that exists in corrections`, item.id);
      } else {
        usedCorrections.add(o.correctionId);
      }
    } else if (o.correctionId) {
      pushIssue(issues, 'FIX_CORRECTION_ON_OK', `${ip}.objects`,
        `object "${o.id}" is not a mistake and must not carry a correctionId`, item.id);
    }
  }
  if (usedCorrections.size >= item.corrections.length) {
    pushIssue(issues, 'FIX_NO_DISTRACTOR', `${ip}.corrections`,
      'corrections must include at least one distractor beyond the real fixes', item.id);
  }
}

/** create_express: goals stay soft AND satisfiable, and creation means
 *  choice — the palette must offer more than the requirements consume. */
function validateCreateExpress(issues: SpecIssue[], ip: string, item: CreateExpressItem) {
  const paletteIds = new Set(item.palette.map((p) => p.id));
  if (paletteIds.size !== item.palette.length) {
    pushIssue(issues, 'DUPLICATE_ID', `${ip}.palette`, 'palette element ids must be unique', item.id);
  }
  if (item.minElements > item.palette.length) {
    pushIssue(issues, 'CREATE_MIN_TOO_HIGH', `${ip}.minElements`,
      `minElements ${item.minElements} exceeds the palette size ${item.palette.length}`, item.id);
  }
  for (const id of item.mustInclude) {
    if (!paletteIds.has(id)) {
      pushIssue(issues, 'CREATE_MUST_INCLUDE_UNKNOWN', `${ip}.mustInclude`,
        `mustInclude "${id}" is not a palette element`, item.id);
    }
  }
  if (item.palette.length <= Math.max(item.minElements, item.mustInclude.length)) {
    pushIssue(issues, 'CREATE_NO_CHOICE', `${ip}.palette`,
      'the palette must offer more elements than the requirements consume — creation means choice', item.id);
  }
}

/** Learning shells whose whole session is the four-level ladder climb. */
const LADDER_REQUIRED_GAMES: ReadonlySet<GameType> = new Set(['number_city', 'scene_play']);

/** When a session uses the learning ladder, its educational levels carry
 *  exactly recognize → understand → apply → challenge, in order. The
 *  Number City and Scene Play learning shells REQUIRE the ladder — their
 *  whole session is the four-level climb. */
function validateLearningLadder(issues: SpecIssue[], spec: GameSpec) {
  const edu = spec.levels.filter((l) => !l.isIntro);
  const tagged = edu.filter((l) => l.learningLevel != null);
  const intro = spec.levels[0];
  if (intro?.isIntro && intro.learningLevel != null) {
    pushIssue(issues, 'INTRO_LEARNING_LEVEL', 'levels[0].learningLevel',
      'the intro level never carries a learning level');
  }
  if (tagged.length === 0) {
    if (LADDER_REQUIRED_GAMES.has(spec.meta.gameType)) {
      pushIssue(issues, 'LEARNING_LEVELS_REQUIRED', 'levels',
        `${spec.meta.gameType} sessions climb the learning ladder — every educational level needs a learningLevel`);
    }
    return; // classic game session
  }
  if (tagged.length !== edu.length) {
    pushIssue(issues, 'LEARNING_LEVELS_INCOMPLETE', 'levels',
      'either every educational level carries a learningLevel or none does');
    return;
  }
  const order = edu.map((l) => l.learningLevel);
  const canonical = [...LEARNING_LEVELS];
  if (order.length !== canonical.length || order.some((v, i) => v !== canonical[i])) {
    pushIssue(issues, 'LEARNING_LEVELS_ORDER', 'levels',
      `learning sessions carry exactly [${canonical.join(' → ')}] in order, got [${order.join(', ')}]`);
  }
}

function validateDiagram(diagram: Diagram, issues: SpecIssue[]) {
  const nodeIds = new Set<string>();
  diagram.nodes.forEach((n, i) => {
    if (nodeIds.has(n.id)) pushIssue(issues, 'DUPLICATE_ID', `diagram.nodes[${i}].id`, `duplicate node id "${n.id}"`);
    nodeIds.add(n.id);
    if (n.x < DIAGRAM_RULES.coordMin || n.x > DIAGRAM_RULES.coordMax ||
        n.y < DIAGRAM_RULES.coordMin || n.y > DIAGRAM_RULES.coordMax) {
      pushIssue(issues, 'NODE_OUT_OF_BOUNDS', `diagram.nodes[${i}]`,
        `node "${n.id}" outside [${DIAGRAM_RULES.coordMin}, ${DIAGRAM_RULES.coordMax}]`);
    }
  });

  // Pairwise spacing in canvas pixels (fat-finger safety).
  for (let a = 0; a < diagram.nodes.length; a++) {
    for (let b = a + 1; b < diagram.nodes.length; b++) {
      const na = diagram.nodes[a]!;
      const nb = diagram.nodes[b]!;
      const dx = (na.x - nb.x) * DIAGRAM_RULES.canvasW;
      const dy = (na.y - nb.y) * DIAGRAM_RULES.canvasH;
      if (Math.hypot(dx, dy) < DIAGRAM_RULES.minNodeSpacingPx) {
        pushIssue(issues, 'NODES_TOO_CLOSE', 'diagram.nodes',
          `nodes "${na.id}" and "${nb.id}" are closer than ${DIAGRAM_RULES.minNodeSpacingPx}px at 720x1280`);
      }
    }
  }

  const seenEdges = new Set<string>();
  const connected = new Set<string>();
  diagram.edges.forEach((e, i) => {
    const id = edgeId(e.from, e.to);
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) {
      pushIssue(issues, 'EDGE_ENDPOINT_UNKNOWN', `diagram.edges[${i}]`,
        `edge ${id} references a node that does not exist`);
    }
    if (e.from === e.to) pushIssue(issues, 'EDGE_SELF', `diagram.edges[${i}]`, `edge ${id} connects a node to itself`);
    if (seenEdges.has(id)) pushIssue(issues, 'EDGE_DUPLICATE', `diagram.edges[${i}]`, `duplicate edge ${id}`);
    seenEdges.add(id);
    connected.add(e.from);
    connected.add(e.to);
  });

  diagram.distractorNodeIds.forEach((d, i) => {
    if (!nodeIds.has(d)) {
      pushIssue(issues, 'DISTRACTOR_UNKNOWN', `diagram.distractorNodeIds[${i}]`, `distractor "${d}" is not a node`);
    }
    if (connected.has(d)) {
      pushIssue(issues, 'DISTRACTOR_CONNECTED', `diagram.distractorNodeIds[${i}]`,
        `distractor "${d}" appears in an edge — distractors must connect to nothing`);
    }
  });
}

/** Structural + semantic validation in one call. */
export function parseAndValidateGameSpec(data: unknown): { spec?: GameSpec; result: ValidationResult } {
  const parsed = GameSpecSchema.safeParse(data);
  if (!parsed.success) {
    const issues: SpecIssue[] = parsed.error.issues.map((zi) => ({
      code: 'SHAPE',
      path: zi.path.join('.'),
      message: zi.message,
    }));
    return { result: { ok: false, issues } };
  }
  const result = validateGameSpec(parsed.data);
  return { spec: parsed.data, result };
}
