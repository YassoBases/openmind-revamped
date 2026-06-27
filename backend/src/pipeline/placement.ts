/**
 * Placement-test engine: adaptive difficulty selection, answer grading for all
 * four interactivity types, and final node placement.
 *
 * Adaptive rule (per the product spec):
 *   correct   → escalate one band (easy→medium→hard, capped at hard)
 *   wrong     → de-escalate one band (hard→medium→easy, capped at easy)
 *
 * Question selection:
 *   pick a random unanswered question at the current difficulty; if none, try
 *   the adjacent band (prefer higher to keep challenging); if the bank is
 *   exhausted, the test ends early.
 *
 * Placement:
 *   a mastery ratio (0..1) is computed by weighting each correct answer by the
 *   difficulty band (easy=1, medium=2, hard=3). The ratio maps to a path-node
 *   index: floor(mastery * (pathLength - 1)). If questions have linkedNodeId
 *   fields, the first node (by orderIndex) whose linked question was answered
 *   wrong overrides the ratio — the student is placed there to relearn it.
 */
import type {
  PathNodeRow,
  PlacementAnswer,
  PlacementTestSessionRow,
  QuestionDifficulty,
  QuestionRow,
} from '../store/types.js';

export const DIFFICULTY_LADDER: QuestionDifficulty[] = ['easy', 'medium', 'hard'];
const DIFFICULTY_WEIGHT: Record<QuestionDifficulty, number> = { easy: 1, medium: 2, hard: 3 };
export const TARGET_QUESTION_COUNT = 5;

/** Escalate / de-escalate the difficulty after an answer. */
export function nextDifficulty(current: QuestionDifficulty, correct: boolean): QuestionDifficulty {
  const idx = DIFFICULTY_LADDER.indexOf(current);
  if (correct) return DIFFICULTY_LADDER[Math.min(DIFFICULTY_LADDER.length - 1, idx + 1)]!;
  return DIFFICULTY_LADDER[Math.max(0, idx - 1)]!;
}

/**
 * Pick the next question to serve. Avoids re-serving questions the student has
 * already seen in this session. Falls back to an adjacent difficulty band if
 * the current band is exhausted. Returns null when the bank is exhausted.
 */
export function pickNextQuestion(
  bank: QuestionRow[],
  session: PlacementTestSessionRow,
): { question: QuestionRow | null; difficulty: QuestionDifficulty } {
  const answeredIds = new Set(session.answers.map((a) => a.questionId));
  const target = session.currentDifficulty;

  // Try the target band first, then walk outward (prefer harder fallback so a
  // strong student isn't bored, but accept easier if that's all that's left).
  const order: QuestionDifficulty[] = [target];
  const idx = DIFFICULTY_LADDER.indexOf(target);
  for (let step = 1; step < DIFFICULTY_LADDER.length; step++) {
    if (idx + step < DIFFICULTY_LADDER.length) order.push(DIFFICULTY_LADDER[idx + step]!);
    if (idx - step >= 0) order.push(DIFFICULTY_LADDER[idx - step]!);
  }

  for (const diff of order) {
    const pool = bank.filter((q) => q.difficulty === diff && !answeredIds.has(q.id));
    if (pool.length > 0) {
      return { question: pool[Math.floor(Math.random() * pool.length)]!, difficulty: diff };
    }
  }
  return { question: null, difficulty: target };
}

// ─── Grading (one function per interactivity type) ──────────────────────────

function gradeChoice(content: Record<string, unknown>, response: Record<string, unknown>): boolean {
  const correctIndex = content['correctIndex'];
  const selectedIndex = response['selectedIndex'];
  return typeof correctIndex === 'number' && correctIndex === selectedIndex;
}

function gradeDragDrop(content: Record<string, unknown>, response: Record<string, unknown>): boolean {
  const slots = (content['slots'] as { id: string; correctItemId: string }[] | undefined) ?? [];
  const placements = (response['placements'] as { slotId: string; itemId: string }[] | undefined) ?? [];
  if (slots.length === 0) return false;
  const map = new Map(placements.map((p) => [p.slotId, p.itemId]));
  return slots.every((s) => map.get(s.id) === s.correctItemId);
}

function gradeSpin(content: Record<string, unknown>, response: Record<string, unknown>): boolean {
  const correctSegmentId = content['correctSegmentId'];
  const selectedSegmentId = response['selectedSegmentId'];
  return typeof correctSegmentId === 'string' && correctSegmentId === selectedSegmentId;
}

function gradeConnect(content: Record<string, unknown>, response: Record<string, unknown>): boolean {
  const correctPairs = (content['correctPairs'] as { leftId: string; rightId: string }[] | undefined) ?? [];
  const pairs = (response['pairs'] as { leftId: string; rightId: string }[] | undefined) ?? [];
  if (correctPairs.length === 0) return false;
  const correctSet = new Set(correctPairs.map((p) => `${p.leftId}|${p.rightId}`));
  const studentSet = new Set(pairs.map((p) => `${p.leftId}|${p.rightId}`));
  // every correct pair must be present, and the student must not have extras
  return correctPairs.every((p) => studentSet.has(`${p.leftId}|${p.rightId}`)) && studentSet.size === correctSet.size;
}

/** Grade a student's response against a question's content. */
export function gradeAnswer(question: QuestionRow, response: Record<string, unknown>): boolean {
  switch (question.type) {
    case 'choice':
      return gradeChoice(question.content, response);
    case 'drag_drop':
      return gradeDragDrop(question.content, response);
    case 'spin':
      return gradeSpin(question.content, response);
    case 'connect':
      return gradeConnect(question.content, response);
    default:
      return false;
  }
}

// ─── Mastery + placement ─────────────────────────────────────────────────────

/**
 * Compute a 0..1 mastery ratio. Each correct answer contributes its difficulty
 * weight; the maximum possible is `questionCount * 3` (all hard correct).
 */
export function masteryRatio(answers: PlacementAnswer[]): number {
  if (answers.length === 0) return 0;
  const earned = answers.reduce((sum, a) => sum + (a.correct ? DIFFICULTY_WEIGHT[a.difficulty] : 0), 0);
  const max = answers.reduce((sum, a) => sum + DIFFICULTY_WEIGHT[a.difficulty], 0);
  return max === 0 ? 0 : earned / max;
}

/**
 * Decide which path node the student should be placed at.
 *
 * Strategy: if any question linked to a node was answered wrong, place the
 * student at the earliest such node (by orderIndex) — they need to learn that
 * topic. Otherwise map the mastery ratio onto the path: floor(ratio * (n-1)).
 */
export function placeAtNode(
  answers: PlacementAnswer[],
  bank: QuestionRow[],
  nodes: PathNodeRow[],
): PathNodeRow | null {
  if (nodes.length === 0) return null;
  const sortedNodes = [...nodes].sort((a, b) => a.orderIndex - b.orderIndex);

  // Linked-node override: find questions that have a linkedNodeId, check if
  // any was answered wrong, and place at the earliest such node.
  const wrongLinked = new Map<string, boolean>(); // nodeId → was wrong
  for (const ans of answers) {
    const q = bank.find((b) => b.id === ans.questionId);
    if (q?.linkedNodeId) {
      if (!ans.correct) wrongLinked.set(q.linkedNodeId, true);
      else if (!wrongLinked.has(q.linkedNodeId)) wrongLinked.set(q.linkedNodeId, false);
    }
  }
  // earliest (by orderIndex) node that was wrong
  for (const node of sortedNodes) {
    if (wrongLinked.get(node.id) === true) return node;
  }

  // No linked-node miss → map mastery onto the path
  const ratio = masteryRatio(answers);
  const idx = Math.min(sortedNodes.length - 1, Math.floor(ratio * sortedNodes.length));
  return sortedNodes[idx] ?? sortedNodes[0]!;
}

/** Build the public-facing question view (strips the correct answer). */
export function stripAnswer(question: QuestionRow): Record<string, unknown> {
  const content = { ...question.content };
  switch (question.type) {
    case 'choice':
      delete content['correctIndex'];
      break;
    case 'drag_drop':
      // strip correctItemId from each slot
      if (Array.isArray(content['slots'])) {
        content['slots'] = (content['slots'] as { id: string; label: string; labelAr?: string; correctItemId: string }[]).map((s) => {
          const { correctItemId: _drop, ...rest } = s;
          return rest;
        });
      }
      break;
    case 'spin':
      delete content['correctSegmentId'];
      break;
    case 'connect':
      delete content['correctPairs'];
      break;
  }
  return content;
}