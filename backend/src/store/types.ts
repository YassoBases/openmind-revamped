/**
 * Storage abstraction: PrismaStore (Postgres 16) when DATABASE_URL is set,
 * MemoryStore otherwise so `npm run dev` always works with zero setup.
 * Same interface, same semantics; memory data dies with the process (logged loudly).
 */
import type { GameSpec } from '@edumind/shared';

export interface StudentRow {
  id: string;
  name: string;
  gender: string | null;
  grade: number;
  language: string;
  color: string;
  interest: string | null;
  dailyGoal: number;
  xp: number;
  streakCount: number;
  streakLastPlayedAt: Date | null;
  tokenHash: string;
  createdAt: Date;
}

export type GameStatus = 'generating' | 'ready' | 'failed';

export interface GameRow {
  id: string;
  studentId: string;
  gameType: string;
  theme: string;
  subject: string;
  topic: string;
  language: string;
  status: GameStatus;
  error: string | null;
  spec: GameSpec | null;
  shellVersion: string;
  thumbnailUrl: string | null;
  bestScore: number;
  playCount: number;
  lastPlayedAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface PlaySessionRow {
  id: string;
  gameId: string | null; // null for Review-mode sessions
  studentId: string;
  summary: Record<string, unknown>;
  xp: number;
  accuracy: number;
  createdAt: Date;
}

export interface XpEventRow {
  id: string;
  studentId: string;
  amount: number;
  reason: string;
  createdAt: Date;
}

export interface GradeRow {
  id: string;
  name: string;
  index: number;
  createdAt: Date;
}

export interface SubjectRow {
  id: string;
  title: string;
  content: string;
  orderIndex: number;
  gradeId: string;
  createdAt: Date;
}

export interface LearningPathRow {
  id: string;
  name: string;
  description: string;
  subjectId: string;
  createdAt: Date;
}

export interface PathNodeRow {
  id: string;
  title: string;
  subject: string;
  topic: string;
  orderIndex: number;
  xpReward: number;
  learningPathId: string;
  createdAt: Date;
}

// Subject with its nested learning paths (used by read-through endpoints).
export interface SubjectWithPaths extends SubjectRow {
  learningPaths: LearningPathRow[];
}

// Learning path with its nested path nodes (used by read-through endpoints).
export interface LearningPathWithNodes extends LearningPathRow {
  pathNodes: PathNodeRow[];
}


// ─── Placement-test rows ─────────────────────────────────────────────────────

export type QuestionType = 'choice' | 'drag_drop' | 'spin' | 'connect';
export type QuestionDifficulty = 'easy' | 'medium' | 'hard';
export type PlacementTheme = 'bridge' | 'road' | 'map';
export type PlacementTestStatus = 'in_progress' | 'completed' | 'abandoned';

export interface QuestionRow {
  id: string;
  learningPathId: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  content: Record<string, unknown>; // type-specific payload
  linkedNodeId: string | null;
  createdAt: Date;
}

export interface PlacementAnswer {
  questionId: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  correct: boolean;
  response: Record<string, unknown>;
  answeredAt: string; // ISO
}

export interface PlacementTestSessionRow {
  id: string;
  studentId: string;
  learningPathId: string;
  theme: PlacementTheme;
  status: PlacementTestStatus;
  answers: PlacementAnswer[];
  currentDifficulty: QuestionDifficulty;
  questionCount: number;
  placedNodeId: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

export interface Store {
  kind: 'memory' | 'prisma';
  ping(): Promise<boolean>;

  createStudent(data: Omit<StudentRow, 'id' | 'createdAt' | 'xp' | 'streakCount' | 'streakLastPlayedAt'>): Promise<StudentRow>;
  getStudentByToken(tokenHash: string): Promise<StudentRow | null>;
  getStudent(id: string): Promise<StudentRow | null>;
  updateStudent(id: string, patch: Partial<Pick<StudentRow, 'name' | 'color' | 'interest' | 'language' | 'dailyGoal' | 'grade' | 'gender' | 'xp' | 'streakCount' | 'streakLastPlayedAt'>>): Promise<StudentRow>;

  createGame(data: Omit<GameRow, 'createdAt' | 'deletedAt' | 'bestScore' | 'playCount' | 'lastPlayedAt'>): Promise<GameRow>;
  getGame(id: string): Promise<GameRow | null>;
  updateGame(id: string, patch: Partial<Omit<GameRow, 'id' | 'studentId' | 'createdAt'>>): Promise<GameRow>;
  listGames(studentId: string, opts: { limit: number; offset: number }): Promise<{ items: GameRow[]; total: number }>;

  createPlaySession(data: Omit<PlaySessionRow, 'id' | 'createdAt'>): Promise<PlaySessionRow>;
  recentPlaySessions(studentId: string, limit: number): Promise<PlaySessionRow[]>;
  playSessionsSince(studentId: string, since: Date): Promise<PlaySessionRow[]>;

  addXpEvent(studentId: string, amount: number, reason: string): Promise<XpEventRow>;
  listXpEvents(studentId: string, limit: number): Promise<XpEventRow[]>;
  addStreakDay(studentId: string, day: Date): Promise<boolean>; // false if already recorded

  cacheGet(key: string): Promise<Record<string, unknown> | null>;
  cacheSet(key: string, content: Record<string, unknown>, ttlMs: number): Promise<void>;

  //grade
  createGrade(data: Omit<GradeRow, 'id' | 'createdAt'>): Promise<GradeRow>;
  getGrade(id: string): Promise<GradeRow | null>;
  getGradeByIndex(index: number): Promise<GradeRow | null>;
  listGrades(): Promise<GradeRow[]>;
  updateGrade(id: string, patch: Partial<Pick<GradeRow, 'name' | 'index'>>): Promise<GradeRow>;
  deleteGrade(id: string): Promise<void>;

  // Subjects
  createSubject(data: Omit<SubjectRow, 'id' | 'createdAt'>): Promise<SubjectRow>;
  getSubject(id: string): Promise<SubjectRow | null>;
  getSubjectWithPaths(id: string): Promise<SubjectWithPaths | null>;
  listSubjects(gradeId: string): Promise<SubjectRow[]>;
  listSubjectsWithPaths(gradeId: string): Promise<SubjectWithPaths[]>;
  updateSubject(id: string, patch: Partial<Omit<SubjectRow, 'id' | 'gradeId' | 'createdAt'>>): Promise<SubjectRow>;
  deleteSubject(id: string): Promise<void>;

  // Learning paths
  createLearningPath(data: Omit<LearningPathRow, 'id' | 'createdAt'>): Promise<LearningPathRow>;
  getLearningPath(id: string): Promise<LearningPathRow | null>;
  getLearningPathWithNodes(id: string): Promise<LearningPathWithNodes | null>;
  listLearningPaths(subjectId: string): Promise<LearningPathRow[]>;
  updateLearningPath(id: string, patch: Partial<Omit<LearningPathRow, 'id' | 'subjectId' | 'createdAt'>>): Promise<LearningPathRow>;
  deleteLearningPath(id: string): Promise<void>;

  // Path nodes
  createPathNode(data: Omit<PathNodeRow, 'id' | 'createdAt'>): Promise<PathNodeRow>;
  getPathNode(id: string): Promise<PathNodeRow | null>;
  listPathNodes(learningPathId: string): Promise<PathNodeRow[]>;
  updatePathNode(id: string, patch: Partial<Omit<PathNodeRow, 'id' | 'learningPathId' | 'createdAt'>>): Promise<PathNodeRow>;
  deletePathNode(id: string): Promise<void>;

  // ─── Question bank (per learning path) ──────────────────────────────────
  createQuestion(data: Omit<QuestionRow, 'id' | 'createdAt'>): Promise<QuestionRow>;
  getQuestion(id: string): Promise<QuestionRow | null>;
  listQuestions(learningPathId: string, difficulty?: QuestionDifficulty): Promise<QuestionRow[]>;
  updateQuestion(id: string, patch: Partial<Omit<QuestionRow, 'id' | 'learningPathId' | 'createdAt'>>): Promise<QuestionRow>;
  deleteQuestion(id: string): Promise<void>;

  // ─── Placement test sessions ────────────────────────────────────────────
  createPlacementTest(data: Omit<PlacementTestSessionRow, 'id' | 'startedAt' | 'completedAt' | 'answers' | 'currentDifficulty' | 'questionCount' | 'placedNodeId' | 'status'>): Promise<PlacementTestSessionRow>;
  getPlacementTest(id: string): Promise<PlacementTestSessionRow | null>;
  getActivePlacementTest(studentId: string, learningPathId: string): Promise<PlacementTestSessionRow | null>;
  listPlacementTestsByStudent(studentId: string): Promise<PlacementTestSessionRow[]>;
  updatePlacementTest(id: string, patch: Partial<Omit<PlacementTestSessionRow, 'id' | 'studentId' | 'learningPathId' | 'startedAt'>>): Promise<PlacementTestSessionRow>;

}



