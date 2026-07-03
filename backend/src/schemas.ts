/**
 * API request/response schemas (Zod) — validated at runtime AND exported to
 * the OpenAPI 3.1 document served at /api/docs.
 */
import { z } from 'zod';
import {
  GAME_TYPES,
  HEX_COLOR_RE,
  INTEREST_ARCHETYPES,
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
import { LEARNING_CONTEXTS, LEARNING_STAGES, MAX_GRADE, MIN_GRADE } from './learning/stage.js';

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
  /** Middle-school context lens — never mixed with `interest`. */
  learningContext: z.enum(LEARNING_CONTEXTS).nullable().optional(),
  dailyGoal: z.union([z.literal(1), z.literal(3), z.literal(5)]).default(3),
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

export function league(xp: number): 'bronze' | 'silver' | 'gold' {
  if (xp >= 2000) return 'gold';
  if (xp >= 500) return 'silver';
  return 'bronze';
}
