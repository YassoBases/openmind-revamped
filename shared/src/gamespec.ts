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
  LANGUAGES,
  LIMITS,
  SPEC_VERSION,
  THEMES,
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

export const ItemSchema = z.discriminatedUnion('kind', [McqItemSchema, ConnectItemSchema]);
export type Item = z.infer<typeof ItemSchema>;

export const LevelSchema = z.object({
  index: z.number().int().min(0),
  isIntro: z.boolean(),
  title: z.string().min(1).max(LIMITS.levelTitle),
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
    for (const t of level.teaching) out.push(t.text);
    for (const item of level.items) {
      out.push(item.prompt, item.explanation, ...item.hints);
      if (item.kind === 'mcq') out.push(...item.options);
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

      // Kind must match the game type.
      const expectKind = meta.gameType === 'draw_connect' ? 'connect' : 'mcq';
      if (item.kind !== expectKind) {
        pushIssue(issues, 'ITEM_KIND', `${ip}.kind`,
          `${meta.gameType} items must be kind "${expectKind}"`, item.id);
      }

      if (item.kind === 'mcq') {
        const uniq = new Set(item.options.map((o) => o.trim().toLowerCase()));
        if (uniq.size !== 4) {
          pushIssue(issues, 'OPTIONS_NOT_UNIQUE', `${ip}.options`, 'the 4 options must be unique', item.id);
        }
        // Hints must never contain the correct answer verbatim.
        const correct = item.options[item.correctIndex]?.trim().toLowerCase() ?? '';
        if (correct.length >= 3) {
          item.hints.forEach((h, hi) => {
            if (h.toLowerCase().includes(correct)) {
              pushIssue(issues, 'HINT_REVEALS_ANSWER', `${ip}.hints[${hi}]`,
                'hint contains the correct option verbatim', item.id);
            }
          });
        }
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

      // Language purity per item.
      const textBlob = [item.prompt, item.explanation, ...item.hints,
        ...(item.kind === 'mcq' ? item.options : [])].join(' ');
      if (meta.language === 'ar' && !hasArabic(textBlob)) {
        pushIssue(issues, 'LANGUAGE_PURITY', ip, 'Arabic spec item contains no Arabic script', item.id);
      }
    });
  });

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
