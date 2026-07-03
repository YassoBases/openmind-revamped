/**
 * The single source of truth for OpenMind's stage-based product rule:
 * one app, one identity, one tutor — two stage-appropriate learning
 * experiences. Everything that branches on the learner's stage (routes,
 * tutor prompts, views, the Flutter twin core/stage.dart) derives from the
 * authenticated grade through THIS module, never from ad-hoc comparisons.
 */

export const MIN_GRADE = 1;
export const MAX_GRADE = 9;

/** Last grade of the elementary games product. */
export const PRIMARY_MAX_GRADE = 6;

export const LEARNING_STAGES = ['primary_games', 'middle_interactive_learning'] as const;
export type LearningStage = (typeof LEARNING_STAGES)[number];

/** Grades 1-6 → the elementary games product; 7-9 → interactive learning. */
export function stageForGrade(grade: number): LearningStage {
  return grade <= PRIMARY_MAX_GRADE ? 'primary_games' : 'middle_interactive_learning';
}

/**
 * The elementary game-generation pipeline (prompts, validators, fact-check)
 * is calibrated for grades 1-6 ONLY. A middle-school student may still open
 * legacy games, so any grade fed into that pipeline is clamped HERE — at the
 * generation boundary — and nowhere else. Student identity keeps the true grade.
 */
export function gameGenGrade(grade: number): number {
  return Math.min(Math.max(grade, MIN_GRADE), PRIMARY_MAX_GRADE);
}

/**
 * Middle-school context lenses ("عدسة التعلم") — a lightweight learner
 * preference that flavors examples and framing. Deliberately separate from
 * the elementary Student.interest game archetypes. Ids are stable API values;
 * display strings live in the Flutter localization layer.
 */
export const LEARNING_CONTEXTS = [
  'market', // السوق والتجارة
  'building', // البناء والعمران
  'water_energy', // الماء والطاقة
  'roads_transport', // الطرق والمواصلات
  'technology', // التقنية والاتصالات
] as const;
export type LearningContext = (typeof LEARNING_CONTEXTS)[number];
