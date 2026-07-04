/**
 * API request/response schemas (Zod) — validated at runtime AND exported to
 * the OpenAPI 3.1 document served at /api/docs.
 */
import { z } from "zod";
import {
  GAME_TYPES,
  HEX_COLOR_RE,
  INTEREST_ARCHETYPES,
  LANGUAGES,
  DIFFICULTIES,
} from "@edumind/shared";

export const ErrorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

export const CreateStudentBody = z.object({
  name: z.string().min(1).max(24),
  gender: z.enum(["m", "f"]).nullable().optional(),
  grade: z.number().int().min(1).max(6), // elementary school
  language: z.enum(LANGUAGES).default("en"),
  color: z.string().regex(HEX_COLOR_RE).default("#58CC02"),
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
  difficulty: z.enum(DIFFICULTIES).default("normal"),
  language: z.enum(LANGUAGES).optional(), // defaults to the student's language
});

export const GameView = z.object({
  id: z.string(),
  gameType: z.string(),
  theme: z.string(),
  subject: z.string(),
  topic: z.string(),
  language: z.string(),
  status: z.enum(["generating", "ready", "failed"]),
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
  status: z.enum(["generating", "clarify"]),
  clarifyingQuestion: z.string().nullable(),
  stubSpec: z.record(z.string(), z.unknown()).nullable(),
});

export const PatchGameBody = z.object({
  bestScore: z.number().int().min(0).optional(),
  played: z.boolean().optional(), // bumps playCount + lastPlayedAt
});

export const RefineGameBody = z.object({
  op: z.enum(["theme", "harder", "easier", "more_questions"]),
  theme: z.string().optional(),
});

export const PostSessionBody = z.object({
  summary: z.record(z.string(), z.unknown()), // the shell's reportSummary payload
});

export const PostSessionResponse = z.object({
  sessionId: z.string(),
  xpAwarded: z.number(),
  streak: z.object({
    count: z.number(),
    extendedToday: z.boolean(),
    bonusXp: z.number(),
  }),
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
  league: z.enum(["bronze", "silver", "gold"]),
  gamesCount: z.number(),
});

export function league(xp: number): "bronze" | "silver" | "gold" {
  if (xp >= 2000) return "gold";
  if (xp >= 500) return "silver";
  return "bronze";
}

export const CreateGradeBody = z.object({
  name: z.string().min(1).max(80),
  index: z.number().int().min(1).max(6), // elementary school grades
});

export const PatchGradeBody = z.object({
  name: z.string().min(1).max(80).optional(),
  index: z.number().int().min(1).max(6).optional(),
});

export const GradeView = z.object({
  id: z.string(),
  name: z.string(),
  index: z.number(),
  createdAt: z.string(),
});

export const CreateSubjectBody = z.object({
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(4000),
  orderIndex: z.number().int().min(0),
  gradeId: z.string().min(1),
});

export const PatchSubjectBody = z.object({
  title: z.string().min(1).max(120).optional(),
  content: z.string().min(1).max(4000).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

export const SubjectView = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  orderIndex: z.number(),
  gradeId: z.string(),
  createdAt: z.string(),
});

export const LearningPathView = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  subjectId: z.string(),
  createdAt: z.string(),
});

export const SubjectWithPathsView = SubjectView.extend({
  learningPaths: z.array(LearningPathView),
});

export const CreateLearningPathBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(1000),
  subjectId: z.string().min(1),
});

export const PatchLearningPathBody = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().min(1).max(1000).optional(),
});

export const PathNodeView = z.object({
  id: z.string(),
  title: z.string(),
  subject: z.string(),
  topic: z.string(),
  orderIndex: z.number(),
  xpReward: z.number(),
  depth: z.number(),
  learningPathId: z.string(),
  createdAt: z.string(),
});

export const LearningPathWithNodesView = LearningPathView.extend({
  pathNodes: z.array(PathNodeView),
});

export const CreatePathNodeBody = z.object({
  title: z.string().min(1).max(120),
  subject: z.string().min(1).max(80),
  topic: z.string().min(1).max(200),
  orderIndex: z.number().int().min(0),
  xpReward: z.number().int().min(0),
  depth: z.number().int().min(0).max(4).default(0),
  learningPathId: z.string().min(1),
});

export const PatchPathNodeBody = z.object({
  title: z.string().min(1).max(120).optional(),
  subject: z.string().min(1).max(80).optional(),
  topic: z.string().min(1).max(200).optional(),
  orderIndex: z.number().int().min(0).optional(),
  xpReward: z.number().int().min(0).optional(),
  depth: z.number().int().min(0).max(4).optional(),
});

// ─── Placement-test schemas ──────────────────────────────────────────────────
// Question bank: each learning path has its own bank. Questions are one of four
// interactivity types (اختيار / سحب وإفلات / تدوير / رابط). The content payload
// is a discriminated union on a `type` field so Zod validates the right shape.

export const QUESTION_TYPES = [
  "choice",
  "drag_drop",
  "spin",
  "connect",
  "numeric_input",
  "tap_image",
  "open_response",
] as const;

export const QUESTION_DIFFICULTIES = ['intro', 'basic', 'intermediate', 'advanced', 'mastery'] as const;
export const PLACEMENT_THEMES = ["bridge", "road", "map"] as const;

// Per-type content payloads (the JSON stored in Question.content) ─────────────

export const NumericInputContent = z.object({
  type: z.literal("numeric_input"),
  prompt: z.string().min(1).max(500),
  promptAr: z.string().min(1).max(500).optional(),
  correctAnswer: z.number(),
  acceptableVariance: z.number().min(0).default(0),
  unit: z.string().max(20).optional(),
  explanation: z.string().max(500).optional(),
  explanationAr: z.string().max(500).optional(),
});

export const TapImageContent = z.object({
  type: z.literal("tap_image"),
  prompt: z.string().min(1).max(500),
  promptAr: z.string().min(1).max(500).optional(),
  imageUrl: z.string().optional(),
  regions: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        labelAr: z.string().optional(),
        isCorrect: z.boolean(),
      }),
    )
    .min(1)
    .max(20),
  explanation: z.string().max(500).optional(),
  explanationAr: z.string().max(500).optional(),
});

export const OpenResponseContent = z.object({
  type: z.literal("open_response"),
  prompt: z.string().min(1).max(500),
  promptAr: z.string().min(1).max(500).optional(),
  acceptableAnswers: z.array(z.string().min(1).max(200)).min(1).max(10),
  explanation: z.string().max(500).optional(),
  explanationAr: z.string().max(500).optional(),
});
export const NumericInputAnswer = z.object({ value: z.number() });
export const TapImageAnswer = z.object({
  tappedRegionIds: z.array(z.string()).min(0).max(20),
});
export const OpenResponseAnswer = z.object({
  text: z.string().min(1).max(500),
});

export const ChoiceContent = z.object({
  type: z.literal("choice"),
  prompt: z.string().min(1).max(500),
  promptAr: z.string().min(1).max(500).optional(),
  options: z.array(z.string().min(1).max(200)).min(2).max(6),
  optionsAr: z.array(z.string().min(1).max(200)).min(2).max(6).optional(),
  correctIndex: z.number().int().min(0),
  explanation: z.string().max(500).optional(),
  explanationAr: z.string().max(500).optional(),
});

export const DragDropContent = z.object({
  type: z.literal("drag_drop"),
  prompt: z.string().min(1).max(500),
  promptAr: z.string().min(1).max(500).optional(),
  items: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        labelAr: z.string().optional(),
      }),
    )
    .min(2)
    .max(10),
  slots: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        labelAr: z.string().optional(),
        correctItemId: z.string(),
      }),
    )
    .min(1)
    .max(10),
  explanation: z.string().max(500).optional(),
  explanationAr: z.string().max(500).optional(),
});

export const SpinContent = z.object({
  type: z.literal("spin"),
  prompt: z.string().min(1).max(500),
  promptAr: z.string().min(1).max(500).optional(),
  wheelSegments: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        labelAr: z.string().optional(),
      }),
    )
    .min(2)
    .max(8),
  correctSegmentId: z.string(),
  explanation: z.string().max(500).optional(),
  explanationAr: z.string().max(500).optional(),
});

export const ConnectContent = z.object({
  type: z.literal("connect"),
  prompt: z.string().min(1).max(500),
  promptAr: z.string().min(1).max(500).optional(),
  leftItems: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        labelAr: z.string().optional(),
      }),
    )
    .min(2)
    .max(10),
  rightItems: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        labelAr: z.string().optional(),
      }),
    )
    .min(2)
    .max(10),
  correctPairs: z
    .array(z.object({ leftId: z.string(), rightId: z.string() }))
    .min(1)
    .max(10),
  explanation: z.string().max(500).optional(),
  explanationAr: z.string().max(500).optional(),
});

export const QuestionContent = z.discriminatedUnion("type", [
  ChoiceContent,
  DragDropContent,
  SpinContent,
  ConnectContent,
  NumericInputContent,
  TapImageContent,
  OpenResponseContent,
]);
// export const QuestionContent = z.discriminatedUnion('type', [ChoiceContent, DragDropContent, SpinContent, ConnectContent]);

// Answer payloads (what the student submits) ──────────────────────────────────

export const ChoiceAnswer = z.object({
  selectedIndex: z.number().int().min(0),
});
export const DragDropAnswer = z.object({
  placements: z
    .array(z.object({ slotId: z.string(), itemId: z.string() }))
    .min(1)
    .max(20),
});
export const SpinAnswer = z.object({ selectedSegmentId: z.string() });
export const ConnectAnswer = z.object({
  pairs: z
    .array(z.object({ leftId: z.string(), rightId: z.string() }))
    .min(1)
    .max(20),
});

export const QuestionAnswer = z.union([
  ChoiceAnswer,
  DragDropAnswer,
  SpinAnswer,
  ConnectAnswer,
  NumericInputAnswer,
  TapImageAnswer,
  OpenResponseAnswer,
]);
// Question CRUD schemas ───────────────────────────────────────────────────────

export const CreateQuestionBody = z.object({
  type: z.enum(QUESTION_TYPES),
  difficulty: z.enum(QUESTION_DIFFICULTIES),
  content: QuestionContent,
  linkedNodeId: z.string().min(1).optional(),
});

export const PatchQuestionBody = z.object({
  difficulty: z.enum(QUESTION_DIFFICULTIES).optional(),
  content: QuestionContent.optional(),
  linkedNodeId: z.string().nullable().optional(),
});

export const QuestionView = z.object({
  id: z.string(),
  learningPathId: z.string(),
  type: z.enum(QUESTION_TYPES),
  difficulty: z.enum(QUESTION_DIFFICULTIES),
  content: z.record(z.string(), z.unknown()),
  linkedNodeId: z.string().nullable(),
  createdAt: z.string(),
});

// A question as seen by the student during a test — the `content` with the
// correct answer stripped out (the grading happens server-side).
export const QuestionStudentView = z.object({
  id: z.string(),
  type: z.enum(QUESTION_TYPES),
  difficulty: z.enum(QUESTION_DIFFICULTIES),
  content: z.record(z.string(), z.unknown()),
  linkedNodeId: z.string().nullable(),
});

// Placement test schemas ──────────────────────────────────────────────────────

export const StartPlacementTestBody = z.object({
  learningPathId: z.string().min(1),
  theme: z.enum(PLACEMENT_THEMES),
});

export const SubmitAnswerBody = z.object({
  questionId: z.string().min(1),
  response: QuestionAnswer,
});

export const PlacementTestSessionView = z.object({
  id: z.string(),
  learningPathId: z.string(),
  theme: z.enum(PLACEMENT_THEMES),
  status: z.enum(["in_progress", "completed", "abandoned"]),
  currentDifficulty: z.enum(QUESTION_DIFFICULTIES),
  questionCount: z.number(),
  answeredCount: z.number(),
  placedNodeId: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});

export const PlacementTestResultView = z.object({
  sessionId: z.string(),
  learningPathId: z.string(),
  theme: z.enum(PLACEMENT_THEMES),
  status: z.enum(["in_progress", "completed", "abandoned"]),
  totalQuestions: z.number(),
  correctCount: z.number(),
  finalDifficulty: z.enum(QUESTION_DIFFICULTIES),
  masteryRatio: z.number(), // 0..1 — weighted by difficulty
  placedNodeId: z.string().nullable(),
  placedNodeTitle: z.string().nullable(),
  placedNodeOrderIndex: z.number().nullable(),
  answers: z.array(
    z.object({
      questionId: z.string(),
      type: z.enum(QUESTION_TYPES),
      difficulty: z.enum(QUESTION_DIFFICULTIES),
      correct: z.boolean(),
      answeredAt: z.string(),
    }),
  ),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});

// Theme metadata: bilingual labels for the three placement-test themes
// (جسر / طريق / خريطة).
export const THEME_LABELS: Record<string, { en: string; ar: string }> = {
  bridge: { en: "Bridge", ar: "جسر" },
  road: { en: "Road", ar: "طريق" },
  map: { en: "Map", ar: "خريطة" },
};

export const QUESTION_TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  choice: { en: 'Choice', ar: 'اختيار' },
  drag_drop: { en: 'Drag & Drop', ar: 'سحب وإفلات' },
  spin: { en: 'Spin', ar: 'تدوير' },
  connect: { en: 'Connect', ar: 'ربط' },
  numeric_input: { en: 'Numeric Input', ar: 'إدخال رقمي' },
  tap_image: { en: 'Tap Image', ar: 'نقر على الصورة' },
  open_response: { en: 'Open Response', ar: 'إجابة مفتوحة' },
};

// 5 difficulty bands — aligned 1:1 with PathNode.depth (0-4)
export const QUESTION_DIFFICULTY_LABELS: Record<string, { en: string; ar: string; depth: number }> = {
  intro: { en: 'Intro', ar: 'مقدمة', depth: 0 },
  basic: { en: 'Basic', ar: 'أساسي', depth: 1 },
  intermediate: { en: 'Intermediate', ar: 'متوسط', depth: 2 },
  advanced: { en: 'Advanced', ar: 'متقدم', depth: 3 },
  mastery: { en: 'Mastery', ar: 'إتقان', depth: 4 },
};
