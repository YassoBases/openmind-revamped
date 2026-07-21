/**
 * API request/response schemas (Zod) — validated at runtime AND exported to
 * the OpenAPI 3.1 document served at /api/docs.
 */
import { z } from 'zod';
import {
  GAME_TYPES,
  HEX_COLOR_RE,
  INTEREST_ARCHETYPES,
  STUDENT_INTERESTS,
  LANGUAGES,
  DIFFICULTIES,
} from '@edumind/shared';
import {
  TUTOR_RESPONSE_TYPES,
  TUTOR_SUGGESTED_ACTIONS,
  InteractivePayloadSchema,
  InteractiveResultSchema,
  TutorContextSchema,
} from './tutor/contract.js';
import { ResultAnswerSchema } from './tutor/tools/types.js';
import { LEARNING_CONTEXTS, LEARNING_STAGES, MAX_GRADE, MIN_GRADE } from './learning/stage.js';
import {
  ERROR_PATTERNS,
  EVIDENCE_KINDS,
  EVIDENCE_OUTCOMES,
  EVIDENCE_SOURCES,
  EVIDENCE_VERIFICATIONS,
} from './learning/evidence.js';

export const ErrorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

export const CreateStudentBody = z.object({
  name: z.string().min(1).max(24),
  gender: z.enum(['m', 'f']).nullable().optional(),
  grade: z.number().int().min(MIN_GRADE).max(MAX_GRADE), // grades 1-6 primary, 7-9 middle school
  language: z.enum(LANGUAGES).default('en'),
  color: z.string().regex(HEX_COLOR_RE).default('#58CC02'),
  /** Elementary game-engine archetype — primary stage only. */
  interest: z.enum(INTEREST_ARCHETYPES).nullable().optional(),
  /** Middle-school context lens — legacy; kept as a fallback for profiles without `interests`. */
  learningContext: z.enum(LEARNING_CONTEXTS).nullable().optional(),
  /** Personal interests chosen at onboarding (1-2, both stages) — the primary AI-flavor signal. */
  interests: z.array(z.enum(STUDENT_INTERESTS)).min(1).max(2).optional(),
  dailyGoal: z.union([z.literal(1), z.literal(3), z.literal(5)]).default(3),
  /**
   * Client-generated, persisted per device install. Lets a retry after a
   * lost response (the server created the account but the client never saw
   * the reply) return the SAME account with a freshly issued token instead
   * of creating a duplicate — see routes/students.ts.
   */
  installationId: z.string().min(8).max(128).optional(),
});

export const StudentView = z.object({
  id: z.string(),
  name: z.string(),
  gender: z.string().nullable(),
  grade: z.number(),
  /** Resolved product mode — the client trusts this, not its own grade math. */
  stage: z.enum(LEARNING_STAGES),
  language: z.string(),
  color: z.string(),
  interest: z.string().nullable(),
  learningContext: z.string().nullable(),
  interests: z.array(z.string()),
  dailyGoal: z.number(),
  xp: z.number(),
  streakCount: z.number(),
});

export const CreateStudentResponse = z.object({
  studentId: z.string(),
  token: z.string(),
  student: StudentView,
});

// NOT CreateStudentBody.partial(): partial() keeps the .default() values, so
// a PATCH of one field would silently reset language/color/dailyGoal to their
// defaults. Every field here is plain-optional — absent means "leave as is".
export const PatchStudentBody = z.object({
  name: z.string().min(1).max(24).optional(),
  gender: z.enum(['m', 'f']).nullable().optional(),
  grade: z.number().int().min(MIN_GRADE).max(MAX_GRADE).optional(),
  language: z.enum(LANGUAGES).optional(),
  color: z.string().regex(HEX_COLOR_RE).optional(),
  interest: z.enum(INTEREST_ARCHETYPES).nullable().optional(),
  learningContext: z.enum(LEARNING_CONTEXTS).nullable().optional(),
  interests: z.array(z.enum(STUDENT_INTERESTS)).min(1).max(2).optional(),
  dailyGoal: z.union([z.literal(1), z.literal(3), z.literal(5)]).optional(),
});

export const CreateGameBody = z.object({
  subject: z.string().max(80).optional(),
  topic: z.string().min(1).max(200),
  gameType: z.enum(GAME_TYPES),
  theme: z.string().min(1),
  sessionLength: z.union([z.literal(3), z.literal(5), z.literal(7)]).default(5),
  difficulty: z.enum(DIFFICULTIES).default('normal'),
  language: z.enum(LANGUAGES).optional(), // defaults to the student's language
});

/** Lesson Worlds: one lesson (curated or free topic) → a stage-map world. */
export const CreateWorldBody = z.object({
  subject: z.string().max(80).optional(),
  topic: z.string().min(1).max(200),
  /** Curated-catalog lesson id, when picked from the lesson picker. */
  lessonId: z.string().max(80).optional(),
  /** Curriculum grounding from the catalog entry — the planner covers these. */
  focusConcepts: z.array(z.string().min(1).max(60)).max(8).optional(),
  language: z.enum(LANGUAGES).optional(), // defaults to the student's language
});

export const GameView = z.object({
  id: z.string(),
  gameType: z.string(),
  theme: z.string(),
  subject: z.string(),
  topic: z.string(),
  language: z.string(),
  status: z.enum(['generating', 'ready', 'failed']),
  error: z.string().nullable(),
  shellVersion: z.string(),
  thumbnailUrl: z.string().nullable(),
  bestScore: z.number(),
  playCount: z.number(),
  lastPlayedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const CreateGameResponse = z.object({
  gameId: z.string().nullable(),
  status: z.enum(['generating', 'clarify']),
  clarifyingQuestion: z.string().nullable(),
  stubSpec: z.record(z.string(), z.unknown()).nullable(),
});

export const PatchGameBody = z.object({
  bestScore: z.number().int().min(0).optional(),
  played: z.boolean().optional(), // bumps playCount + lastPlayedAt
});

export const RefineGameBody = z.object({
  op: z.enum(['theme', 'harder', 'easier', 'more_questions']),
  theme: z.string().optional(),
});

export const PostSessionBody = z.object({
  summary: z.record(z.string(), z.unknown()), // the shell's reportSummary payload
});

export const PostSessionResponse = z.object({
  sessionId: z.string(),
  xpAwarded: z.number(),
  streak: z.object({ count: z.number(), extendedToday: z.boolean(), bonusXp: z.number() }),
  enrichedFeedback: z.object({
    headline: z.string(),
    body: z.string(),
    reviewSuggestions: z.array(z.string()),
  }),
});

export const StatsResponse = z.object({
  xp: z.number(),
  streakCount: z.number(),
  dailyGoal: z.number(),
  todaySessions: z.number(),
  todayXp: z.number(),
  goalMetToday: z.boolean(),
  league: z.enum(['bronze', 'silver', 'gold']),
  gamesCount: z.number(),
});

export const AskTutorBody = z.object({
  question: z.string().min(1).max(600),
  /** Omit to start a new conversation; pass back to continue one. */
  conversationId: z.string().max(64).optional(),
  context: TutorContextSchema.optional(),
  /** What the learner did on the last interactive block (Ask → See → Try). */
  interactiveResult: InteractiveResultSchema.optional(),
});

export const TutorReplyView = z.object({
  message: z.string(),
  responseType: z.enum(TUTOR_RESPONSE_TYPES),
  followUpQuestion: z.string().nullable(),
  suggestedAction: z.enum(TUTOR_SUGGESTED_ACTIONS),
  relatedConcept: z.string().nullable(),
  needsClarification: z.boolean(),
  interactivePayload: InteractivePayloadSchema.nullable(),
});

export const AskTutorResponse = z.object({
  conversationId: z.string(),
  reply: TutorReplyView,
  model: z.string(),
});

export const TutorMessageView = z.object({
  id: z.string(),
  role: z.enum(['student', 'tutor']),
  content: z.string(),
  responseType: z.string().nullable(),
  /** Tutor turns: the interactive block offered with this reply, if any. */
  interactivePayload: InteractivePayloadSchema.nullable(),
  /** Student turns: the interaction result this message reported, if any. */
  interactiveResult: InteractiveResultSchema.nullable(),
  createdAt: z.string(),
});

export const TutorConversationResponse = z.object({
  conversationId: z.string(),
  messages: z.array(TutorMessageView),
});

// ---- middle-school learning progress ---------------------------------------

/** Marks one experience completed (idempotent — replays don't duplicate). */
export const PutLearnProgressBody = z.object({
  pathId: z.string().min(1).max(80),
  experienceId: z.string().min(1).max(80),
});

export const LearnProgressItem = z.object({
  pathId: z.string(),
  experienceId: z.string(),
  completedAt: z.string(),
});

export const LearnProgressResponse = z.object({
  items: z.array(LearnProgressItem),
  total: z.number(),
});

export const PutLearnProgressResponse = z.object({
  saved: z.literal(true),
  alreadyCompleted: z.boolean(),
  completedAt: z.string(),
  total: z.number(),
});

// ---- learning evidence (per-skill readiness log) ---------------------------

/**
 * One learner submission. Client-authored (id + createdAt included) and
 * append-only, so upserts are idempotent by id. A separate domain from
 * completion — evidence feeds readiness/diagnostics, never overwrites it.
 */
export const LearnEvidenceEvent = z.object({
  id: z.string().min(8).max(64),
  skillId: z.string().min(1).max(80),
  representation: z.string().min(1).max(20),
  context: z.string().max(40).nullable().optional(),
  source: z.enum(EVIDENCE_SOURCES),
  kind: z.enum(EVIDENCE_KINDS),
  outcome: z.enum(EVIDENCE_OUTCOMES),
  verification: z.enum(EVIDENCE_VERIFICATIONS),
  attempt: z.number().int().min(1).max(99).optional(),
  hints: z.number().int().min(0).max(99).optional(),
  recovered: z.boolean().optional(),
  errorPattern: z.enum(ERROR_PATTERNS).nullable().optional(),
  toolId: z.string().max(40).nullable().optional(),
  pathId: z.string().max(80).nullable().optional(),
  experienceId: z.string().max(80).nullable().optional(),
  stepIndex: z.number().int().min(0).max(200).nullable().optional(),
  ms: z.number().int().min(0).nullable().optional(),
  createdAt: z.string(),
});

export const PostLearnEvidenceBody = z.object({
  events: z.array(LearnEvidenceEvent).min(1).max(100),
});

export const LearnEvidenceResponse = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
  total: z.number(),
});

export const PostLearnEvidenceResponse = z.object({
  accepted: z.number(),
  total: z.number(),
});

// ---- stateless tool verification (shared by Ask Hudhud AND lesson experiences) ----

/**
 * A lesson-experience widget's attempt: the instance data it authored
 * (client-bundled catalog content, so this call cannot be tamper-proof the
 * way the tutor's thread-anchored verification is — see routes/tools.ts)
 * plus the learner's structured answer. `data` is validated against the
 * named tool's own semantic gate before verifyResult ever runs.
 */
export const ToolVerifyBody = z.object({
  data: z.record(z.string(), z.unknown()),
  answer: ResultAnswerSchema,
  /**
   * Optional — absent means today's behavior byte-for-byte. When present, the
   * graded attempt is recorded as a server_verified evidence row (the server
   * fills outcome/verification/errorPattern from its own verdict, so the
   * client cannot forge those). The rest is position context the server
   * doesn't recompute.
   */
  evidence: z
    .object({
      eventId: z.string().min(8).max(64),
      skillId: z.string().min(1).max(80),
      representation: z.string().min(1).max(20),
      context: z.string().max(40).nullable().optional(),
      kind: z.enum(EVIDENCE_KINDS),
      attempt: z.number().int().min(1).max(99).optional(),
      hints: z.number().int().min(0).max(99).optional(),
      pathId: z.string().max(80).nullable().optional(),
      experienceId: z.string().max(80).nullable().optional(),
      stepIndex: z.number().int().min(0).max(200).nullable().optional(),
      ms: z.number().int().min(0).nullable().optional(),
    })
    .optional(),
});

export const ToolVerifyResponse = z.object({
  verdict: z.string(),
  /** The tool's diagnosis of a non-correct answer, when it has one. */
  errorPattern: z.string().nullable().optional(),
});

export function league(xp: number): 'bronze' | 'silver' | 'gold' {
  if (xp >= 2000) return 'gold';
  if (xp >= 500) return 'silver';
  return 'bronze';
}
