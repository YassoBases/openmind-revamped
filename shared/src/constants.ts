/**
 * EduMind shared constants — single source of truth for game types, themes,
 * personalization archetypes, design palette, XP rules and content limits.
 * Mirrored (by hand, kept small on purpose) in shells/src/lib/educore.js and
 * flutter_module/lib/core/constants.dart.
 */

export const SPEC_VERSION = 1 as const;

export const GAME_TYPES = ['quest_path', 'goal_shootout', 'draw_connect'] as const;
export type GameType = (typeof GAME_TYPES)[number];

export const THEMES: Record<GameType, readonly string[]> = {
  quest_path: ['fantasy', 'sci_fi', 'detective', 'anime'],
  goal_shootout: ['football', 'basketball', 'hockey', 'archery'],
  draw_connect: ['blueprint', 'notebook', 'whiteboard', 'chalkboard'],
} as const;

export const LANGUAGES = ['en', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

export const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const SESSION_LENGTHS = [3, 5, 7] as const;
export type SessionLength = (typeof SESSION_LENGTHS)[number];

// Elementary school (grades 1–6) — v4.1 retarget from the original 7–12.
export const GRADE_MIN = 1;
export const GRADE_MAX = 6;

/**
 * Interest archetypes. Original, never branded. The normalizer maps any
 * licensed-character request ("like Spider-Man") to the closest archetype.
 */
export const INTEREST_ARCHETYPES = [
  'dinosaurs',
  'space',
  'football',
  'cats',
  'robots',
  'ocean',
  'cars',
  'royalty',
  'art',
  'music',
] as const;
export type InterestArchetype = (typeof INTEREST_ARCHETYPES)[number];

/**
 * The warm OpenMind palette (also defined in shells + Flutter). Light, calm
 * backgrounds; Main Teal for interactive elements; Deep Teal instead of
 * heavy black; orange/green for success and progress; Berry Pink sparingly,
 * decoration only.
 */
export const PALETTE = {
  warmCream: '#FDF2E2',
  softSand: '#FAE9D0',
  mainTeal: '#079A90',
  deepTeal: '#19725E',
  brightOrange: '#EF9722',
  softPeach: '#FADBB0',
  leafGreen: '#84A253',
  deepGreen: '#4D8C58',
  softSkyBlue: '#CEEBF0',
  berryPink: '#D93B5E',
  warmBrown: '#B5702F',
} as const;

/** XP rules. Hint usage scales XP but NEVER feeds the AdaptiveEngine. */
export const XP_RULES = {
  correctNoHint: 10,
  correctOneHint: 7,
  correctTwoHints: 5,
  levelComplete: 50,
  mastery: 200,
  streakBonusPerDay: 25,
  streakBonusCap: 250,
} as const;

/** Content length limits (characters). Enforced by the spec validators. */
export const LIMITS = {
  teachCardText: 280,
  explanation: 220,
  hint: 140,
  prompt: 200,
  option: 90,
  nodeLabel: 36,
  levelTitle: 80,
  narrativeIntro: 400,
  narrativeOutro: 400,
  narrativePerLevel: 220,
  studentName: 24,
  itemsPerLevelMin: 4,
  itemsPerLevelMax: 6,
  teachCardsMin: 1,
  teachCardsMax: 3,
  hintsMin: 1,
  hintsMax: 2,
} as const;

/** Draw & Connect geometry rules (normalized coords on a 720x1280 canvas). */
export const DIAGRAM_RULES = {
  coordMin: 0.05,
  coordMax: 0.95,
  /** Minimum pairwise node distance in *pixels* on the 720x1280 canvas
   *  (≈ 0.12 × 720 — fat-finger safety at 720w). */
  minNodeSpacingPx: 86,
  canvasW: 720,
  canvasH: 1280,
  minValidEdges: 4,
  minDistractors: 2,
  minNodes: 4,
  maxNodes: 14,
} as const;

/** Adaptive engine tuning. Correctness only — hints/combos never feed it. */
export const ADAPTIVE_RULES = {
  startTarget: { easy: 1.5, normal: 2.5, hard: 3.5 } as Record<Difficulty, number>,
  stepUpAfterStreak: 2, // consecutive correct answers
  stepDownAfterStreak: 2, // consecutive wrong answers
  step: 0.75,
  targetMin: 1,
  targetMax: 5,
  itemsPresentedPerLevel: 3, // drawn adaptively from the 4–6 item pool
  masteryFinalLevelScore: 0.75,
  masteryConsecutiveLevels: 3,
  masteryConsecutiveScore: 0.8,
  frustrationConsecutiveLevels: 3,
  frustrationScore: 0.4,
  /** Consecutive not-first-try items before the supportive break (no hearts,
   *  no lives — a wrong answer costs nothing and earns a retry). */
  strainBeforeBreak: 3,
} as const;

/** Session length → level structure. Level 0 is ALWAYS the intro tutorial. */
export function educationalLevelCount(sessionLength: SessionLength): number {
  return sessionLength - 1;
}

/** Canonical edge id for draw_connect edges. */
export function edgeId(from: string, to: string): string {
  return `${from}->${to}`;
}

export const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
export const ARABIC_SCRIPT_RE = /[؀-ۿ]/;
