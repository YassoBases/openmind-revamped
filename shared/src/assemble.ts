/**
 * Spec assembly — turns LLM ContentSpec output (no ids, no intro level)
 * into a full GameSpec, and builds progressive-start stub specs.
 * Used by the backend pipeline and by tests; pure functions, no I/O.
 */
import type {
  ConnectContentSpec,
  GameSpec,
  Item,
  Level,
  McqContentSpec,
  Meta,
  ScenePlayContentSpec,
  Student,
  StubSpec,
  SummaryHints,
  TeachCard,
} from './gamespec.js';
import type { ConnectStageContent, StageContent, WorldStagePlan } from './worldspec.js';
import { DIFFICULTY_BY_RAMP } from './worldspec.js';
import { KITS_BY_GAME, KIT_BY_INTEREST, LEARNING_LEVELS, SPEC_VERSION, THEMES } from './constants.js';

const INTRO_TITLES: Record<string, { en: string; ar: string }> = {
  quest_path: { en: 'The Adventure Begins', ar: 'تبدأ المغامرة' },
  goal_shootout: { en: 'Warm-Up', ar: 'الإحماء' },
  draw_connect: { en: 'Getting the Feel', ar: 'تعرّف على اللعبة' },
  number_city: { en: 'Welcome to My Town', ar: 'أهلًا بك في بلدتي' },
  scene_play: { en: 'Welcome to the Wonder Lab', ar: 'أهلًا بك في مختبر العجائب' },
};

/** The intro level carries no educational content — the tutorial is built into each shell. */
export function buildIntroLevel(meta: Meta): Level {
  const titles = INTRO_TITLES[meta.gameType] ?? { en: 'Tutorial', ar: 'تدريب' };
  return {
    index: 0,
    isIntro: true,
    title: meta.language === 'ar' ? titles.ar : titles.en,
    teaching: [],
    items: [],
  };
}

export function buildStubSpec(meta: Meta, student: Student): StubSpec {
  return {
    specVersion: SPEC_VERSION,
    stub: true,
    meta: withNumeralDefault(meta),
    student,
    levels: [],
  };
}

function withNumeralDefault(meta: Meta): Meta {
  if (meta.numerals) return meta;
  return { ...meta, numerals: meta.language === 'ar' ? 'arabic_indic' : 'western' };
}

interface GeneratedLevelLike {
  title: string;
  teaching: Array<Omit<TeachCard, 'id'>>;
  items: Array<Record<string, unknown>>;
}

function assignIds(levels: GeneratedLevelLike[], kind: 'mcq' | 'connect'): Level[] {
  return levels.map((level, i) => {
    const li = i + 1; // level 0 is the intro
    return {
      index: li,
      isIntro: false,
      title: level.title,
      teaching: level.teaching.map((t, ti) => ({
        id: `l${li}_t${ti + 1}`,
        text: t.text,
        emphasis: t.emphasis ?? [],
      })),
      items: level.items.map((raw, ii) => ({
        ...(raw as object),
        kind,
        id: `l${li}_i${ii + 1}`,
      })) as Item[],
    };
  });
}

/** Assemble a full GameSpec from generated content (quest_path / goal_shootout). */
export function assembleMcqSpec(meta: Meta, student: Student, content: McqContentSpec): GameSpec {
  return {
    specVersion: SPEC_VERSION,
    meta: withNumeralDefault(meta),
    student,
    narrative: content.narrative,
    levels: [buildIntroLevel(meta), ...assignIds(content.levels, 'mcq')],
    summaryHints: content.summaryHints,
  };
}

/** Assemble a full GameSpec from generated content (draw_connect). */
export function assembleConnectSpec(meta: Meta, student: Student, content: ConnectContentSpec): GameSpec {
  const spec: GameSpec = {
    specVersion: SPEC_VERSION,
    meta: withNumeralDefault(meta),
    student,
    levels: [buildIntroLevel(meta), ...assignIds(content.levels, 'connect')],
    diagram: content.diagram,
    summaryHints: content.summaryHints,
  };
  if (content.narrative) spec.narrative = content.narrative;
  return spec;
}

/**
 * Assemble a full GameSpec from generated content (scene_play).
 * Server-side determinism the LLM never touches: item/card ids, the
 * learning ladder stamped by level index (recognize → understand → apply →
 * challenge), and the interest kit — picked from the student's interest via
 * KIT_BY_INTEREST when the meta omits a wrapper.
 */
export function assembleSceneSpec(meta: Meta, student: Student, content: ScenePlayContentSpec): GameSpec {
  const withKit: Meta =
    meta.wrapper != null
      ? meta
      : { ...meta, wrapper: student.interest ? KIT_BY_INTEREST[student.interest] : 'nature' };
  const levels: Level[] = content.levels.map((level, i) => {
    const li = i + 1; // level 0 is the intro
    const assembled: Level = {
      index: li,
      isIntro: false,
      title: level.title,
      learningLevel: LEARNING_LEVELS[i],
      teaching: level.teaching.map((t, ti) => ({
        id: `l${li}_t${ti + 1}`,
        text: t.text,
        emphasis: t.emphasis ?? [],
      })),
      items: level.items.map((raw, ii) => ({
        ...raw,
        id: `l${li}_i${ii + 1}`,
      })) as Item[],
    };
    if (level.observe) assembled.observe = level.observe;
    if (level.notice) assembled.notice = level.notice;
    return assembled;
  });
  const spec: GameSpec = {
    specVersion: SPEC_VERSION,
    meta: withNumeralDefault(withKit),
    student,
    levels: [buildIntroLevel(withKit), ...levels],
    summaryHints: content.summaryHints,
  };
  if (content.narrative) spec.narrative = content.narrative;
  return spec;
}

/**
 * Re-personalize cached content for a different student: spec content is
 * cached by (subject, topic, language, gameType, theme, grade, difficulty,
 * sessionLength); the student block is injected at assembly time, so
 * repeated topics are nearly free.
 */
export function personalizeSpec(spec: GameSpec, student: Student): GameSpec {
  return { ...spec, student };
}

// ---------------------------------------------------------------------------
// Lesson Worlds — stage assembly
// ---------------------------------------------------------------------------

export interface StageAssemblyInput {
  worldId: string;
  /** 1-based position of the stage in its world. */
  stageIndex: number;
  /** Total stages in the world (stamps meta.stageCount for finale flair). */
  stageCount?: number;
  stagePlan: WorldStagePlan;
  /** The world's narrative arc (rides every stage's narrative intro/outro). */
  arc: { intro: string; outro: string };
  /** The world's summaryHints (stage specs reuse them for the summary screen). */
  summaryHints: SummaryHints;
  subject: string;
  language: 'en' | 'ar';
  grade: number;
  student: Student;
  content: StageContent;
}

/**
 * Assemble ONE world stage into a playable GameSpec (scope='stage').
 *
 * Server-side determinism, same doctrine as the session assemblers: ids are
 * stamped here (`s{stageIndex}_t{k}` / `s{stageIndex}_i{k}` — world-unique so
 * evidence rows never collide across stages), the scene ladder rung comes
 * from the WORLD PLAN (never the stage LLM call), the intro/tutorial level
 * rides only stage 1, and the stage's narrative beat becomes the single
 * perLevel entry.
 */
export function assembleStageSpec(input: StageAssemblyInput): GameSpec {
  const { stagePlan, stageIndex, content, student } = input;
  const gameType = stagePlan.gameType;
  // Scene-kind families keep the item `kind` discriminator and carry a
  // ladder rung + interest kit: scene_play (Wonder Lab) and number_city
  // (My Town — stage-generatable since the Phase 3 rework).
  const scene = gameType === 'scene_play' || gameType === 'number_city';

  let wrapper = stagePlan.kit;
  if (scene && wrapper == null) {
    // Interest-picked kit, clamped to the family's own kit list — My Town
    // only knows nature/construction while the Lab knows all five.
    const kits = KITS_BY_GAME[gameType] as readonly string[];
    const pick = student.interest ? KIT_BY_INTEREST[student.interest] : 'nature';
    wrapper = kits.includes(pick) ? pick : (kits.includes('nature') ? 'nature' : kits[0]);
  }

  const meta: Meta = withNumeralDefault({
    gameType,
    theme: stagePlan.theme ?? (THEMES[gameType][0] as string),
    subject: input.subject,
    topic: stagePlan.focus,
    language: input.language,
    grade: input.grade,
    difficulty: DIFFICULTY_BY_RAMP[stagePlan.ramp],
    // Unused in stage scope (STAGE_LEVEL_COUNT governs shape) but required
    // by the Meta schema; the smallest legal value documents the irrelevance.
    sessionLength: 3,
    scope: 'stage',
    worldId: input.worldId,
    stageIndex,
    ...(input.stageCount != null ? { stageCount: input.stageCount } : {}),
    variant: stagePlan.variant,
    ...(wrapper != null ? { wrapper: wrapper as Meta['wrapper'] } : {}),
  });

  const withIntro = stageIndex === 1;
  const levelIndex = withIntro ? 1 : 0;
  const sid = `s${stageIndex}`;

  const eduLevel: Level = {
    index: levelIndex,
    isIntro: false,
    title: content.title,
    teaching: content.teaching.map((t, ti) => ({
      id: `${sid}_t${ti + 1}`,
      text: t.text,
      emphasis: t.emphasis ?? [],
    })),
    items: content.items.map((raw, ii) => ({
      ...(raw as object),
      // mcq/connect stage items omit kind (single-kind family); scene items
      // carry their own kind discriminator.
      ...(scene ? {} : { kind: gameType === 'draw_connect' ? 'connect' : 'mcq' }),
      id: `${sid}_i${ii + 1}`,
    })) as Item[],
  };
  if (scene && stagePlan.learningLevel) eduLevel.learningLevel = stagePlan.learningLevel;
  if ('observe' in content && content.observe) eduLevel.observe = content.observe;
  if ('notice' in content && content.notice) eduLevel.notice = content.notice;

  const spec: GameSpec = {
    specVersion: SPEC_VERSION,
    meta,
    student,
    narrative: {
      intro: input.arc.intro,
      outro: input.arc.outro,
      perLevel: [stagePlan.beat],
    },
    levels: withIntro ? [buildIntroLevel(meta), eduLevel] : [eduLevel],
    summaryHints: input.summaryHints,
  };
  if (gameType === 'draw_connect') {
    spec.diagram = (content as ConnectStageContent).diagram;
  }
  return spec;
}
