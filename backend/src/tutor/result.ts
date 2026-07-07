/**
 * Interaction Result Integrity — the server-side gate a learner result passes
 * BEFORE it reaches the LLM or the persistence layer. The client's
 * correctnessOrOutcome is a claim, never a verdict:
 *
 *  1. The result must match a real, still-open block instance the tutor
 *     offered in THIS conversation (found in the persisted thread — the same
 *     source of truth restoration uses). No match → rejected.
 *  2. One attempt per instance is enforced HERE, not just in the client UI:
 *     a second result for an already-answered instance → rejected.
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

export type ResultRejectReason =
  | 'no_open_block' // no unanswered block of this type was ever offered here
  | 'duplicate' // that instance already has a result (one attempt only)
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
  /** v1 blocks allow exactly one attempt; stored for future multi-attempt tools. */
  attempt: number;
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
}

/** Newest unanswered payload of the result's type in this thread, if any. */
function findOpenInstance(
  messages: TutorMessageRow[],
  blockType: string,
): { payload: InteractivePayload } | { reject: 'no_open_block' | 'duplicate' } {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    const payload = m.context?.interactivePayload as InteractivePayload | undefined;
    if (m.role !== 'tutor' || payload?.type !== blockType) continue;
    const answered = messages
      .slice(i + 1)
      .some(
        (later) =>
          later.role === 'student' &&
          (later.context?.interactiveResult as InteractiveResult | undefined)?.blockType === blockType,
      );
    return answered ? { reject: 'duplicate' } : { payload };
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
    return { result: null, signal };
  };

  if (!tool || !tool.available) return reject('unknown_tool');

  const match = findOpenInstance(messages, submitted.blockType);
  if ('reject' in match) return reject(match.reject);
  // An instance from before a tool version bump can no longer be interpreted
  // under current semantics — same rule the offer path applies.
  if (match.payload.version !== tool.version) return reject('version_mismatch');

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
    return { result: submitted, signal };
  }

  // Deterministic verification ran — the server's outcome is the outcome.
  signal.verification = 'server_verified';
  signal.outcome = verdict;
  // Diagnose a verified miss so the readiness signal (and any evidence row the
  // route writes from it) carries a specific error pattern, not just "wrong".
  if ((verdict === 'incorrect' || verdict === 'partially_correct') && tool.diagnoseError) {
    const pattern = tool.diagnoseError(match.payload.data as unknown as ToolDataView, submitted.answer ?? {});
    if (pattern) signal.errorPattern = pattern;
  }
  if (submitted.correctnessOrOutcome !== verdict) {
    signal.claimedOutcome = submitted.correctnessOrOutcome;
    return { result: { ...submitted, correctnessOrOutcome: verdict }, signal };
  }
  return { result: submitted, signal };
}
