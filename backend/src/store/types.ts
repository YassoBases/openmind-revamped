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
}
