/**
 * Storage abstraction: PrismaStore (Postgres 16) when DATABASE_URL is set,
 * MemoryStore otherwise so `npm run dev` always works with zero setup.
 * Same interface, same semantics; memory data dies with the process (logged loudly).
 */
import type { GameSpec, WorldPlanContent } from '@edumind/shared';

export interface StudentRow {
  id: string;
  name: string;
  gender: string | null;
  grade: number;
  language: string;
  color: string;
  /** Elementary game-engine archetype (primary stage). */
  interest: string | null;
  /** Middle-school context lens (middle stage) — legacy; fallback only when interests is empty. */
  learningContext: string | null;
  /** Personal interests chosen at onboarding (1-2, both stages) — the primary AI-flavor signal. */
  interests: string[];
  dailyGoal: number;
  xp: number;
  streakCount: number;
  streakLastPlayedAt: Date | null;
  tokenHash: string;
  /** Client-generated per-install idempotency key for POST /students — see routes/students.ts. */
  installationId: string | null;
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

export type WorldStatus = 'planning' | 'ready' | 'failed';
export type WorldStageStatus = 'planned' | 'generating' | 'ready' | 'failed';

/**
 * A Lesson World: one school lesson (or free topic) turned into a planned
 * sequence of short stages. The plan is stored whole; each stage's spec
 * lives on its own row (per-stage generation, retry, and prefetch).
 */
export interface WorldRow {
  id: string;
  studentId: string;
  /** Curated-catalog lesson id, when the world came from the lesson picker. */
  lessonId: string | null;
  subject: string;
  topic: string;
  language: string;
  grade: number;
  status: WorldStatus;
  error: string | null;
  title: string | null;
  plan: WorldPlanContent | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface WorldStageRow {
  worldId: string;
  /** 1-based position in the world's plan. */
  index: number;
  status: WorldStageStatus;
  error: string | null;
  spec: GameSpec | null;
  /** Result of the child's best run (null until first completion). */
  stars: number | null;
  bestAccuracy: number | null;
  completedAt: Date | null;
  generatedAt: Date | null;
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
  /** Idempotent-retry lookup for POST /students — see routes/students.ts. */
  getStudentByInstallationId(installationId: string): Promise<StudentRow | null>;
  updateStudent(id: string, patch: Partial<Pick<StudentRow, 'name' | 'color' | 'interest' | 'learningContext' | 'interests' | 'language' | 'dailyGoal' | 'grade' | 'gender' | 'xp' | 'streakCount' | 'streakLastPlayedAt' | 'tokenHash'>>): Promise<StudentRow>;

  createGame(data: Omit<GameRow, 'createdAt' | 'deletedAt' | 'bestScore' | 'playCount' | 'lastPlayedAt'>): Promise<GameRow>;
  getGame(id: string): Promise<GameRow | null>;
  updateGame(id: string, patch: Partial<Omit<GameRow, 'id' | 'studentId' | 'createdAt'>>): Promise<GameRow>;
  listGames(studentId: string, opts: { limit: number; offset: number }): Promise<{ items: GameRow[]; total: number }>;

  createWorld(data: Omit<WorldRow, 'createdAt' | 'deletedAt'>): Promise<WorldRow>;
  getWorld(id: string): Promise<WorldRow | null>;
  updateWorld(id: string, patch: Partial<Omit<WorldRow, 'id' | 'studentId' | 'createdAt'>>): Promise<WorldRow>;
  listWorlds(studentId: string, opts: { limit: number; offset: number }): Promise<{ items: WorldRow[]; total: number }>;

  /** Insert-or-replace one stage row (keyed worldId+index). */
  upsertWorldStage(data: WorldStageRow): Promise<WorldStageRow>;
  getWorldStage(worldId: string, index: number): Promise<WorldStageRow | null>;
  updateWorldStage(worldId: string, index: number, patch: Partial<Omit<WorldStageRow, 'worldId' | 'index'>>): Promise<WorldStageRow>;
  listWorldStages(worldId: string): Promise<WorldStageRow[]>;

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
