/** In-memory store — dev fallback when DATABASE_URL is unset. Data dies on restart. */
import { randomUUID } from 'node:crypto';
import { uniqueConstraintError } from './errors.js';
import type { GameRow, LearnEvidenceInput, LearnEvidenceRow, LearnProgressRow, PlaySessionRow, Store, StudentRow, TutorMessageRow, XpEventRow } from './types.js';

export class MemoryStore implements Store {
  kind = 'memory' as const;
  private students = new Map<string, StudentRow>();
  private games = new Map<string, GameRow>();
  private sessions: PlaySessionRow[] = [];
  private xpEvents: XpEventRow[] = [];
  private tutorMessages: TutorMessageRow[] = [];
  private learnProgress: LearnProgressRow[] = [];
  private learnEvidence: LearnEvidenceRow[] = [];
  private streakDays = new Set<string>();
  private cache = new Map<string, { content: Record<string, unknown>; expiresAt: number }>();

  async ping() {
    return true;
  }

  async createStudent(data: Omit<StudentRow, 'id' | 'createdAt' | 'xp' | 'streakCount' | 'streakLastPlayedAt'>) {
    // Mirrors the Postgres `@unique` constraint on installationId (schema.prisma)
    // so a duplicate-insert race behaves the same way regardless of store
    // backend — routes/students.ts relies on this to safely recover instead
    // of creating two accounts for one installation.
    if (data.installationId && (await this.getStudentByInstallationId(data.installationId))) {
      throw uniqueConstraintError('installationId');
    }
    const row: StudentRow = {
      ...data,
      id: randomUUID(),
      xp: 0,
      streakCount: 0,
      streakLastPlayedAt: null,
      createdAt: new Date(),
    };
    this.students.set(row.id, row);
    return row;
  }

  async getStudentByToken(tokenHash: string) {
    for (const s of this.students.values()) if (s.tokenHash === tokenHash) return s;
    return null;
  }

  async getStudent(id: string) {
    return this.students.get(id) ?? null;
  }

  async getStudentByInstallationId(installationId: string) {
    for (const s of this.students.values()) if (s.installationId === installationId) return s;
    return null;
  }

  async updateStudent(id: string, patch: Partial<StudentRow>) {
    const s = this.students.get(id);
    if (!s) throw new Error('student not found');
    Object.assign(s, patch);
    return s;
  }

  async createGame(data: Omit<GameRow, 'createdAt' | 'deletedAt' | 'bestScore' | 'playCount' | 'lastPlayedAt'>) {
    const row: GameRow = {
      ...data,
      bestScore: 0,
      playCount: 0,
      lastPlayedAt: null,
      createdAt: new Date(),
      deletedAt: null,
    };
    this.games.set(row.id, row);
    return row;
  }

  async getGame(id: string) {
    return this.games.get(id) ?? null;
  }

  async updateGame(id: string, patch: Partial<GameRow>) {
    const g = this.games.get(id);
    if (!g) throw new Error('game not found');
    Object.assign(g, patch);
    return g;
  }

  async listGames(studentId: string, opts: { limit: number; offset: number }) {
    const all = [...this.games.values()]
      .filter((g) => g.studentId === studentId && !g.deletedAt)
      .sort((a, b) => (b.lastPlayedAt ?? b.createdAt).getTime() - (a.lastPlayedAt ?? a.createdAt).getTime());
    return { items: all.slice(opts.offset, opts.offset + opts.limit), total: all.length };
  }

  async createPlaySession(data: Omit<PlaySessionRow, 'id' | 'createdAt'>) {
    const row: PlaySessionRow = { ...data, id: randomUUID(), createdAt: new Date() };
    this.sessions.push(row);
    return row;
  }

  async recentPlaySessions(studentId: string, limit: number) {
    return this.sessions
      .filter((s) => s.studentId === studentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async playSessionsSince(studentId: string, since: Date) {
    return this.sessions.filter((s) => s.studentId === studentId && s.createdAt >= since);
  }

  async upsertLearnProgress(studentId: string, pathId: string, experienceId: string) {
    const existing = this.learnProgress.find(
      (p) => p.studentId === studentId && p.pathId === pathId && p.experienceId === experienceId,
    );
    if (existing) return { row: existing, created: false };
    const row: LearnProgressRow = { id: randomUUID(), studentId, pathId, experienceId, completedAt: new Date() };
    this.learnProgress.push(row);
    return { row, created: true };
  }

  async listLearnProgress(studentId: string) {
    return this.learnProgress
      .filter((p) => p.studentId === studentId)
      .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  }

  async upsertLearnEvidence(studentId: string, events: LearnEvidenceInput[]) {
    let accepted = 0;
    for (const e of events) {
      // Idempotent by id (per student): the same event replayed never doubles.
      if (this.learnEvidence.some((r) => r.studentId === studentId && r.id === e.id)) continue;
      this.learnEvidence.push({ ...e, studentId });
      accepted++;
    }
    return { accepted };
  }

  async listLearnEvidence(studentId: string, since?: Date) {
    return this.learnEvidence
      .filter((e) => e.studentId === studentId && (!since || e.createdAt >= since))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createTutorMessage(data: Omit<TutorMessageRow, 'id' | 'createdAt'>) {
    const row: TutorMessageRow = { ...data, id: randomUUID(), createdAt: new Date() };
    this.tutorMessages.push(row);
    return row;
  }

  async listTutorMessages(studentId: string, conversationId: string, limit: number) {
    const all = this.tutorMessages.filter(
      (m) => m.studentId === studentId && m.conversationId === conversationId,
    );
    return all.slice(-limit);
  }

  async addXpEvent(studentId: string, amount: number, reason: string) {
    const row: XpEventRow = { id: randomUUID(), studentId, amount, reason, createdAt: new Date() };
    this.xpEvents.push(row);
    return row;
  }

  async listXpEvents(studentId: string, limit: number) {
    return this.xpEvents
      .filter((e) => e.studentId === studentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async addStreakDay(studentId: string, day: Date) {
    const key = `${studentId}|${day.toISOString().slice(0, 10)}`;
    if (this.streakDays.has(key)) return false;
    this.streakDays.add(key);
    return true;
  }

  async cacheGet(key: string) {
    const hit = this.cache.get(key);
    if (!hit || hit.expiresAt < Date.now()) return null;
    return hit.content;
  }

  async cacheSet(key: string, content: Record<string, unknown>, ttlMs: number) {
    this.cache.set(key, { content, expiresAt: Date.now() + ttlMs });
  }
}
