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
  /** Elementary game-engine archetype (primary stage). */
  interest: string | null;
  /** Middle-school context lens (middle stage) — separate domain from interest. */
  learningContext: string | null;
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

/**
 * One completed middle-school learning experience. A separate progress domain
 * from games/PlaySession on purpose: primary game history and middle-school
 * learning journeys never overwrite each other.
 */
export interface LearnProgressRow {
  id: string;
  studentId: string;
  pathId: string;
  experienceId: string;
  completedAt: Date;
}

/**
 * One learner submission — the generalized LearningSignal, one small
 * append-only row per attempt. Readiness is DERIVED from these (per skill ×
 * representation × context), never stored. `id` is client-generated so the
 * log is idempotent across the local cap, the batch upsert, and two-way sync.
 * A separate domain from completion: evidence never overwrites LearnProgress.
 */
export interface LearnEvidenceRow {
  id: string;
  studentId: string;
  skillId: string;
  representation: string;
  /** Lens id (market, water_energy…) or null. */
  context: string | null;
  source: string; // learn_step | checkpoint | tutor_block | tool_verify
  kind: string; // exploration | prediction | construction | transfer | recall | explanation
  outcome: string; // correct | partially_correct | incorrect | explored
  verification: string; // server_verified | client_reported
  attempt: number;
  hints: number;
  recovered: boolean;
  errorPattern: string | null;
  toolId: string | null;
  pathId: string | null;
  experienceId: string | null;
  stepIndex: number | null;
  /** Time-on-task; never interpreted alone (see readiness derivation). */
  ms: number | null;
  createdAt: Date;
}

/** Client-authored evidence, id + createdAt included (both come from the client). */
export type LearnEvidenceInput = Omit<LearnEvidenceRow, 'studentId'>;

/** One turn of a tutor conversation (Ask OpenMind / in-experience help). */
export interface TutorMessageRow {
  id: string;
  studentId: string;
  conversationId: string;
  role: 'student' | 'tutor';
  content: string;
  /** Tutor turns: responseType of the structured reply. */
  responseType: string | null;
  /** Learning context attached to the turn (subject, experience, step…). */
  context: Record<string, unknown> | null;
  createdAt: Date;
}

export interface Store {
  kind: 'memory' | 'prisma';
  ping(): Promise<boolean>;

  createStudent(data: Omit<StudentRow, 'id' | 'createdAt' | 'xp' | 'streakCount' | 'streakLastPlayedAt'>): Promise<StudentRow>;
  getStudentByToken(tokenHash: string): Promise<StudentRow | null>;
  getStudent(id: string): Promise<StudentRow | null>;
  updateStudent(id: string, patch: Partial<Pick<StudentRow, 'name' | 'color' | 'interest' | 'learningContext' | 'language' | 'dailyGoal' | 'grade' | 'gender' | 'xp' | 'streakCount' | 'streakLastPlayedAt'>>): Promise<StudentRow>;

  createGame(data: Omit<GameRow, 'createdAt' | 'deletedAt' | 'bestScore' | 'playCount' | 'lastPlayedAt'>): Promise<GameRow>;
  getGame(id: string): Promise<GameRow | null>;
  updateGame(id: string, patch: Partial<Omit<GameRow, 'id' | 'studentId' | 'createdAt'>>): Promise<GameRow>;
  listGames(studentId: string, opts: { limit: number; offset: number }): Promise<{ items: GameRow[]; total: number }>;

  createPlaySession(data: Omit<PlaySessionRow, 'id' | 'createdAt'>): Promise<PlaySessionRow>;
  recentPlaySessions(studentId: string, limit: number): Promise<PlaySessionRow[]>;
  playSessionsSince(studentId: string, since: Date): Promise<PlaySessionRow[]>;

  /** Idempotent completion upsert; `created` is false when it was already recorded. */
  upsertLearnProgress(studentId: string, pathId: string, experienceId: string): Promise<{ row: LearnProgressRow; created: boolean }>;
  listLearnProgress(studentId: string): Promise<LearnProgressRow[]>;

  /** Idempotent batch append of evidence, deduped by client-generated id. */
  upsertLearnEvidence(studentId: string, events: LearnEvidenceInput[]): Promise<{ accepted: number }>;
  listLearnEvidence(studentId: string, since?: Date): Promise<LearnEvidenceRow[]>;

  createTutorMessage(data: Omit<TutorMessageRow, 'id' | 'createdAt'>): Promise<TutorMessageRow>;
  /** Messages of one conversation, oldest first (capped at limit, newest kept). */
  listTutorMessages(studentId: string, conversationId: string, limit: number): Promise<TutorMessageRow[]>;

  addXpEvent(studentId: string, amount: number, reason: string): Promise<XpEventRow>;
  listXpEvents(studentId: string, limit: number): Promise<XpEventRow[]>;
  addStreakDay(studentId: string, day: Date): Promise<boolean>; // false if already recorded

  cacheGet(key: string): Promise<Record<string, unknown> | null>;
  cacheSet(key: string, content: Record<string, unknown>, ttlMs: number): Promise<void>;
}
