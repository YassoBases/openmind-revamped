/**
 * The learning-evidence vocabulary shared across the tutor path, the stateless
 * tool-verify route, and the client's readiness derivation. One event = one
 * learner submission; readiness is always DERIVED from the append-only log,
 * per skill × representation × context — never a global level, never a
 * learning-style label. Dart twin: edumind-ui/lib/features/learn/readiness_logic.dart.
 */

/**
 * The diagnosable error patterns. Each maps to a specific support action
 * (see support.ts) — never a generic "try again". A wrong answer is a
 * diagnosis, not just a miss.
 */
export const ERROR_PATTERNS = [
  'concept_misunderstanding', // the underlying idea is wrong (didn't see two sides / forgot ÷2)
  'representation_confusion', // misread a diagram/beam/graph for the concept
  'wrong_unit', // right number, wrong or missing unit (m vs m²)
  'calculation_slip', // right method, arithmetic slipped
  'procedural_error', // right idea, a step of the procedure was skipped/reversed
  'transfer_difficulty', // knows it in one context, not yet in a new one
] as const;
export type ErrorPattern = (typeof ERROR_PATTERNS)[number];

/** Derived from the step kind that produced the event — never authored. */
export const EVIDENCE_KINDS = [
  'exploration',
  'prediction',
  'construction',
  'transfer',
  'recall',
  'explanation',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Where an evidence event was produced. */
export const EVIDENCE_SOURCES = ['learn_step', 'checkpoint', 'tutor_block', 'tool_verify'] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

/** The outcome wire values (same enum the interactive result uses). */
export const EVIDENCE_OUTCOMES = ['correct', 'partially_correct', 'incorrect', 'explored'] as const;
export type EvidenceOutcome = (typeof EVIDENCE_OUTCOMES)[number];

/** Trust level of an event — weighed differently in the readiness derivation. */
export const EVIDENCE_VERIFICATIONS = ['server_verified', 'client_reported'] as const;
export type EvidenceVerification = (typeof EVIDENCE_VERIFICATIONS)[number];

/**
 * Bump together with readiness_logic.dart's readinessAlgoVersion when the
 * derivation rules change, so mixed client/server views never disagree.
 */
export const readinessAlgoVersion = 1;
