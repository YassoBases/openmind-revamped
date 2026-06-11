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
  grade: z.number().int().min(1).max(6), // elementary school
  language: z.enum(LANGUAGES).default('en'),
  color: z.string().regex(HEX_COLOR_RE).default('#58CC02'),
  interest: z.enum(INTEREST_ARCHETYPES).nullable().optional(),
  dailyGoal: z.union([z.literal(1), z.literal(3), z.literal(5)]).default(3),
});

export const StudentView = z.object({
  id: z.string(),
  name: z.string(),
  gender: z.string().nullable(),
  grade: z.number(),
  language: z.string(),
  color: z.string(),
  interest: z.string().nullable(),
  dailyGoal: z.number(),
  xp: z.number(),
  streakCount: z.number(),
});

export const CreateStudentResponse = z.object({
  studentId: z.string(),
  token: z.string(),
  student: StudentView,
});

export const PatchStudentBody = CreateStudentBody.partial();

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

export function league(xp: number): 'bronze' | 'silver' | 'gold' {
  if (xp >= 2000) return 'gold';
  if (xp >= 500) return 'silver';
  return 'bronze';
}
