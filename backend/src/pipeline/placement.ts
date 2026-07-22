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
} from "../store/types.js";

// 5 difficulty bands — aligned 1:1 with PathNode.depth (0-4). The placement
// test escalates/de-escalates across these 5 bands, and the final band the
// student reaches corresponds directly to the path-node depth they should
// start learning at.
export const DIFFICULTY_LADDER: QuestionDifficulty[] = ['intro', 'basic', 'intermediate', 'advanced', 'mastery'];
const DIFFICULTY_WEIGHT: Record<QuestionDifficulty, number> = { intro: 1, basic: 2, intermediate: 3, advanced: 4, mastery: 5 };
// Map a difficulty band to its corresponding path-node depth (0-4).
const DIFFICULTY_TO_DEPTH: Record<QuestionDifficulty, number> = { intro: 0, basic: 1, intermediate: 2, advanced: 3, mastery: 4 };
export const TARGET_QUESTION_COUNT = 5;

/** Escalate / de-escalate the difficulty after an answer. */
export function nextDifficulty(
  current: QuestionDifficulty,
  correct: boolean,
): QuestionDifficulty {
  const idx = DIFFICULTY_LADDER.indexOf(current);
  if (correct)
    return DIFFICULTY_LADDER[Math.min(DIFFICULTY_LADDER.length - 1, idx + 1)]!;
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
    if (idx + step < DIFFICULTY_LADDER.length)
      order.push(DIFFICULTY_LADDER[idx + step]!);
    if (idx - step >= 0) order.push(DIFFICULTY_LADDER[idx - step]!);
  }

  for (const diff of order) {
    const pool = bank.filter(
      (q) => q.difficulty === diff && !answeredIds.has(q.id),
    );
    if (pool.length > 0) {
      return {
        question: pool[Math.floor(Math.random() * pool.length)]!,
        difficulty: diff,
      };
    }
  }
  return { question: null, difficulty: target };
}

// ─── Grading (one function per interactivity type) ──────────────────────────

function gradeChoice(
  content: Record<string, unknown>,
  response: Record<string, unknown>,
): boolean {
  const correctIndex = content["correctIndex"];
  const selectedIndex = response["selectedIndex"];
  return typeof correctIndex === "number" && correctIndex === selectedIndex;
}

function gradeDragDrop(
  content: Record<string, unknown>,
  response: Record<string, unknown>,
): boolean {
  const slots =
    (content["slots"] as { id: string; correctItemId: string }[] | undefined) ??
    [];
  const placements =
    (response["placements"] as
      | { slotId: string; itemId: string }[]
      | undefined) ?? [];
  if (slots.length === 0) return false;
  const map = new Map(placements.map((p) => [p.slotId, p.itemId]));
  return slots.every((s) => map.get(s.id) === s.correctItemId);
}

function gradeSpin(
  content: Record<string, unknown>,
  response: Record<string, unknown>,
): boolean {
  const correctSegmentId = content["correctSegmentId"];
  const selectedSegmentId = response["selectedSegmentId"];
  return (
    typeof correctSegmentId === "string" &&
    correctSegmentId === selectedSegmentId
  );
}

function gradeConnect(
  content: Record<string, unknown>,
  response: Record<string, unknown>,
): boolean {
  const correctPairs =
    (content["correctPairs"] as
      | { leftId: string; rightId: string }[]
      | undefined) ?? [];
  const pairs =
    (response["pairs"] as { leftId: string; rightId: string }[] | undefined) ??
    [];
  if (correctPairs.length === 0) return false;
  const correctSet = new Set(
    correctPairs.map((p) => `${p.leftId}|${p.rightId}`),
  );
  const studentSet = new Set(pairs.map((p) => `${p.leftId}|${p.rightId}`));
  // every correct pair must be present, and the student must not have extras
  return (
    correctPairs.every((p) => studentSet.has(`${p.leftId}|${p.rightId}`)) &&
    studentSet.size === correctSet.size
  );
}

function gradeNumericInput(
  content: Record<string, unknown>,
  response: Record<string, unknown>,
): boolean {
  const correctAnswer = content["correctAnswer"];
  const variance = (content["acceptableVariance"] as number | undefined) ?? 0;
  const value = response["value"];
  if (typeof correctAnswer !== "number" || typeof value !== "number")
    return false;
  return Math.abs(value - correctAnswer) <= variance;
}

function gradeTapImage(
  content: Record<string, unknown>,
  response: Record<string, unknown>,
): boolean {
  const regions =
    (content["regions"] as { id: string; isCorrect: boolean }[] | undefined) ??
    [];
  const tapped = (response["tappedRegionIds"] as string[] | undefined) ?? [];
  if (regions.length === 0) return false;
  const correctSet = new Set(
    regions.filter((r) => r.isCorrect).map((r) => r.id),
  );
  const tappedSet = new Set(tapped);
  // correct if the student tapped exactly the correct regions (no more, no less)
  return (
    correctSet.size === tappedSet.size &&
    [...correctSet].every((id) => tappedSet.has(id))
  );
}

function gradeOpenResponse(
  content: Record<string, unknown>,
  response: Record<string, unknown>,
): boolean {
  const acceptable =
    (content["acceptableAnswers"] as string[] | undefined) ?? [];
  const text = response["text"];
  if (typeof text !== "string" || acceptable.length === 0) return false;
  const normalized = text.trim().toLowerCase();
  return acceptable.some((a) => a.trim().toLowerCase() === normalized);
}

/** Grade a student's response against a question's content. */
export function gradeAnswer(
  question: QuestionRow,
  response: Record<string, unknown>,
): boolean {
  switch (question.type) {
    case "choice":
      return gradeChoice(question.content, response);
    case "drag_drop":
      return gradeDragDrop(question.content, response);
    case "spin":
      return gradeSpin(question.content, response);
    case "connect":
      return gradeConnect(question.content, response);
    case "numeric_input":
      return gradeNumericInput(question.content, response);
    case "tap_image":
      return gradeTapImage(question.content, response);
    case "open_response":
      return gradeOpenResponse(question.content, response);
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
  const earned = answers.reduce(
    (sum, a) => sum + (a.correct ? DIFFICULTY_WEIGHT[a.difficulty] : 0),
    0,
  );
  const max = answers.reduce(
    (sum, a) => sum + DIFFICULTY_WEIGHT[a.difficulty],
    0,
  );
  return max === 0 ? 0 : earned / max;
}

export function placeAtNode(
  answers: PlacementAnswer[],
  bank: QuestionRow[],
  nodes: PathNodeRow[],
): PathNodeRow | null {
  if (nodes.length === 0) return null;
  const sortedNodes = [...nodes].sort((a, b) => a.orderIndex - b.orderIndex);

  // ── Strategy 1: Linked-node override ──────────────────────────────────────
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

  // ── Strategy 2: Depth-based placement ─────────────────────────────────────
  // Aggregate per-depth performance from the question difficulties.
  const depthPerf = new Map<number, { correct: number; total: number }>();
  for (const ans of answers) {
    const depth = DIFFICULTY_TO_DEPTH[ans.difficulty];
    const perf = depthPerf.get(depth) ?? { correct: 0, total: 0 };
    perf.total++;
    if (ans.correct) perf.correct++;
    depthPerf.set(depth, perf);
  }

  // Find the highest depth available on the path (max node.depth)
  const maxNodeDepth = Math.max(...sortedNodes.map((n) => n.depth));

  // Walk from the highest depth DOWN; place at the first depth where the
  // student struggled (< 50% correct). If we reach depth 0 and they even
  // struggled there, place at the first node.
  for (let depth = maxNodeDepth; depth >= 0; depth--) {
    const perf = depthPerf.get(depth);
    if (!perf) continue; // no questions at this depth — skip
    const ratio = perf.correct / perf.total;
    if (ratio < 0.5) {
      // They struggled at this depth → place at the first node of this depth
      const nodeAtDepth = sortedNodes.find((n) => n.depth === depth);
      if (nodeAtDepth) return nodeAtDepth;
    }
  }

  // They aced every depth they were tested on → place at the highest-depth
  // node available on the path (mastery achieved, start at the top).
  const highestDepthNode = sortedNodes.find((n) => n.depth === maxNodeDepth);
  if (highestDepthNode) return highestDepthNode;

  // ── Strategy 3: Fallback — positional mastery mapping ─────────────────────
  const ratio = masteryRatio(answers);
  const idx = Math.min(sortedNodes.length - 1, Math.floor(ratio * sortedNodes.length));
  return sortedNodes[idx] ?? sortedNodes[0]!;
}

/** Build the public-facing question view (strips the correct answer). */
//nawal
export function stripAnswer(question: QuestionRow): Record<string, unknown> {
  const content = { ...question.content };
  switch (question.type) {
    case "choice":
      delete content["correctIndex"];
      break;
    case "drag_drop":
      // strip correctItemId from each slot
      if (Array.isArray(content["slots"])) {
        content["slots"] = (
          content["slots"] as {
            id: string;
            label: string;
            labelAr?: string;
            correctItemId: string;
          }[]
        ).map((s) => {
          const { correctItemId: _drop, ...rest } = s;
          return rest;
        });
      }
      break;
    case "spin":
      delete content["correctSegmentId"];
      break;
    case "connect":
      delete content["correctPairs"];
      break;
    case "numeric_input":
      delete content["correctAnswer"];
      delete content["acceptableVariance"];
      break;
    case "tap_image":
      // strip isCorrect from each region
      if (Array.isArray(content["regions"])) {
        content["regions"] = (
          content["regions"] as {
            id: string;
            label: string;
            labelAr?: string;
            isCorrect: boolean;
          }[]
        ).map((r) => {
          const { isCorrect: _drop, ...rest } = r;
          return rest;
        });
      }
      break;
    case "open_response":
      delete content["acceptableAnswers"];
      break;
  }
  return content;
}
