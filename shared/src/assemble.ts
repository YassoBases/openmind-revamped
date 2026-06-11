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
  Student,
  StubSpec,
  TeachCard,
} from './gamespec.js';
import { SPEC_VERSION } from './constants.js';

const INTRO_TITLES: Record<string, { en: string; ar: string }> = {
  quest_path: { en: 'The Adventure Begins', ar: 'تبدأ المغامرة' },
  goal_shootout: { en: 'Warm-Up', ar: 'الإحماء' },
  draw_connect: { en: 'Getting the Feel', ar: 'تعرّف على اللعبة' },
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
 * Re-personalize cached content for a different student: spec content is
 * cached by (subject, topic, language, gameType, theme, grade, difficulty,
 * sessionLength); the student block is injected at assembly time, so
 * repeated topics are nearly free.
 */
export function personalizeSpec(spec: GameSpec, student: Student): GameSpec {
  return { ...spec, student };
}
