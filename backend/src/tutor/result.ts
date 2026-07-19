/**
 * Interaction Result Integrity — the server-side gate a learner result passes
 * BEFORE it reaches the LLM or the persistence layer. The client's
 * correctnessOrOutcome is a claim, never a verdict:
 *
 *  1. The result must match a real, still-open block instance the tutor
 *     offered in THIS conversation (found in the persisted thread — the same
 *     source of truth restoration uses). No match → rejected.
 *  2. Attempts per instance are bounded HERE, not just in the client UI:
 *     a mistake may be retried (supportive-retry pedagogy) up to
 *     MAX_ATTEMPTS_PER_INSTANCE accepted attempts, but an instance whose
 *     accepted result was already correct/explored is CLOSED — any further
 *     result → rejected (duplicate protection), so a success can never be
 *     farmed or replayed.
 *  3. When the structured answer is present, the tool's descriptor recomputes
 *     the outcome against the ORIGINAL instance data; a wrong claim is
 *     overridden. An answer that does not fit the instance → rejected.
 *  4. Every submission — accepted or rejected — produces one minimal
 *     structured LearningSignal, persisted on the student turn's existing
 *     context column (no new storage subsystem).
 *
 * Rejection is always SAFE: the student's message still becomes a normal
 * conversation turn and the tutor still answers the text — there is just no
 * false success, no duplicate result turn, and no poisoned follow-up.
 */
import type { TutorMessageRow } from '../store/types.js';
import type { ErrorPattern } from '../learning/evidence.js';
import type { InteractivePayload, InteractiveResult } from './contract.js';
import { getTool, subjectFromLabel } from './tools/registry.js';
import type { ToolDataView } from './tools/types.js';

export type ResultVerification = 'server_verified' | 'client_reported' | 'rejected';

/**
 * Retry budget per block instance. A wrong answer never freezes the block —
 * the learner may try again — but the budget keeps the duplicate protection
 * meaningful and matches the hint-first pedagogy (after the last attempt the
 * tutor explains fully instead of letting the learner grind).
 */
export const MAX_ATTEMPTS_PER_INSTANCE = 3;

export type ResultRejectReason =
  | 'no_open_block' // no unanswered block of this type was ever offered here
  | 'duplicate' // that instance was already completed (correct/explored)
  | 'attempt_limit' // the per-instance retry budget is spent
  | 'version_mismatch' // instance predates a tool version bump
  | 'unknown_tool' // type not in the registry / tool switched off
  | 'invalid_answer'; // answer supplied but does not fit the instance

/**
 * The minimal structured learning signal stored per submission — small on
 * purpose: enough for future personalization, nothing speculative. Lives in
 * TutorMessage.context alongside interactiveResult (existing storage and
 * privacy model; createdAt on the row already gives safe timing).
 */
export interface LearningSignal {
  tool: string;
  toolVersion: number;
  primitive: string;
  /** Registry subject resolved from the client context label, or the tool's single subject. */
  subject: string | null;
  /** The concept the client context named, when any. */
  concept: string | null;
  /** Did the learner actually complete the interaction? */
  completed: boolean;
  /** The FINAL outcome (server-recomputed when verification ran); null when rejected. */
  outcome: string | null;
  verification: ResultVerification;
  /** Present only when the server overrode a wrong client claim. */
  claimedOutcome?: string;
  rejectReason?: ResultRejectReason;
  /** Which accepted attempt on this instance this is (1 = first try). */
  attempt: number;
  /** True when a correct outcome followed earlier wrong attempts on this instance. */
  recovered?: boolean;
  /** The micro-skill this block evidenced (from the client context), when known. */
  skillId?: string;
  /** The representation the learner worked in (from the client context). */
  representation?: string;
  /** Server-diagnosed error pattern on a non-correct verified verdict. */
  errorPattern?: ErrorPattern;
}

export interface AssessedResult {
  /** What may continue to the LLM and persistence — null when rejected. */
  result: InteractiveResult | null;
  signal: LearningSignal;
  /**
   * True when this instance can accept no further attempt (completed, budget
   * spent, or unmatchable) — the client uses it to freeze the block. False
   * means "still open: the learner may retry".
   */
  closed: boolean;
}

/** An outcome that completes an instance — no retry after these. */
function completes(outcome: string | undefined): boolean {
  return outcome === 'correct' || outcome === 'explored';
}

/**
 * Newest payload of the result's type in this thread with its attempt state.
 * Accepted results after that instance count as prior attempts: a completing
 * one (correct/explored) closes the instance; MAX_ATTEMPTS_PER_INSTANCE
 * accepted attempts exhaust its retry budget. Rejected submissions are never
 * persisted as interactiveResult, so they can not consume the budget.
 */
function findOpenInstance(
  messages: TutorMessageRow[],
  blockType: string,
): { payload: InteractivePayload; attempt: number } | { reject: 'no_open_block' | 'duplicate' | 'attempt_limit' } {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    const payload = m.context?.interactivePayload as InteractivePayload | undefined;
    if (m.role !== 'tutor' || payload?.type !== blockType) continue;
    const prior = messages
      .slice(i + 1)
      .filter((later) => later.role === 'student')
      .map((later) => later.context?.interactiveResult as InteractiveResult | undefined)
      .filter((r): r is InteractiveResult => r?.blockType === blockType);
    if (prior.some((r) => completes(r.correctnessOrOutcome))) return { reject: 'duplicate' };
    if (prior.length >= MAX_ATTEMPTS_PER_INSTANCE) return { reject: 'attempt_limit' };
    return { payload, attempt: prior.length + 1 };
  }
  return { reject: 'no_open_block' };
}

export function assessInteractiveResult(
  submitted: InteractiveResult,
  messages: TutorMessageRow[],
  context: {
    subjectLabel?: string | null;
    concept?: string | null;
    skills?: string[] | null;
    representation?: string | null;
  },
): AssessedResult {
  const tool = getTool(submitted.blockType);
  const signal: LearningSignal = {
    tool: submitted.blockType,
    toolVersion: tool?.version ?? 0,
    primitive: tool?.primitive ?? 'unknown',
    subject:
      subjectFromLabel(context.subjectLabel) ??
      (tool && tool.subjects.length === 1 && tool.subjects[0] !== '*' ? tool.subjects[0]! : null),
    concept: context.concept ?? null,
    completed: submitted.attempted,
    outcome: null,
    verification: 'rejected',
    attempt: 1,
    // The first tagged skill of the current step identifies the readiness cell
    // this block feeds; representation lets it be scored per-representation.
    ...(context.skills?.[0] ? { skillId: context.skills[0] } : {}),
    ...(context.representation ? { representation: context.representation } : {}),
  };
  const reject = (reason: ResultRejectReason): AssessedResult => {
    signal.rejectReason = reason;
    // invalid_answer leaves the instance open (an honest client may retry);
    // every other rejection means no further attempt can ever land.
    return { result: null, signal, closed: reason !== 'invalid_answer' };
  };

  if (!tool || !tool.available) return reject('unknown_tool');

  const match = findOpenInstance(messages, submitted.blockType);
  if ('reject' in match) return reject(match.reject);
  // An instance from before a tool version bump can no longer be interpreted
  // under current semantics — same rule the offer path applies.
  if (match.payload.version !== tool.version) return reject('version_mismatch');
  signal.attempt = match.attempt;

  /** Accepted: the instance closes on completion or when the budget is spent. */
  const accept = (result: InteractiveResult): AssessedResult => ({
    result,
    signal,
    closed: completes(signal.outcome ?? undefined) || match.attempt >= MAX_ATTEMPTS_PER_INSTANCE,
  });

  const verdict = tool.verifyResult(
    match.payload.data as unknown as ToolDataView,
    submitted.answer ?? {},
  );
  if (verdict === 'invalid') return reject('invalid_answer');

  if (verdict === 'unverifiable') {
    // Old client: no structured answer to check. Keep v1 behavior (the claim
    // flows through) but the signal records that nothing was verified.
    signal.verification = 'client_reported';
    signal.outcome = submitted.correctnessOrOutcome;
    if (signal.outcome === 'correct' && match.attempt > 1) signal.recovered = true;
    return accept(submitted);
  }

  // Deterministic verification ran — the server's outcome is the outcome.
  signal.verification = 'server_verified';
  signal.outcome = verdict;
  // A correct answer after earlier wrong attempts on this instance is
  // recovery — a stronger learning signal than unaided success is a weaker one.
  if (verdict === 'correct' && match.attempt > 1) signal.recovered = true;
  // Diagnose a verified miss so the readiness signal (and any evidence row the
  // route writes from it) carries a specific error pattern, not just "wrong".
  if ((verdict === 'incorrect' || verdict === 'partially_correct') && tool.diagnoseError) {
    const pattern = tool.diagnoseError(match.payload.data as unknown as ToolDataView, submitted.answer ?? {});
    if (pattern) signal.errorPattern = pattern;
  }
  if (submitted.correctnessOrOutcome !== verdict) {
    signal.claimedOutcome = submitted.correctnessOrOutcome;
    return accept({ ...submitted, correctnessOrOutcome: verdict });
  }
  return accept(submitted);
}
