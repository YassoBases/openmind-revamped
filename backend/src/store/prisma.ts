/** Prisma-backed store (Postgres 16 / Neon). */
import { randomUUID } from 'node:crypto';
import type { GameSpec } from '@edumind/shared';
import type { GameRow, GameStatus, LearnEvidenceInput, LearnEvidenceRow, LearnProgressRow, PlaySessionRow, Store, StudentRow, TutorMessageRow, XpEventRow } from './types.js';

// PrismaClient is loaded lazily so the backend can boot (memory mode) even if
// `prisma generate` has never run.
type AnyPrisma = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
};

export async function createPrismaStore(): Promise<Store> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient() as unknown as AnyPrisma;

  const toGame = (g: AnyPrisma): GameRow => ({
    id: g.id,
    studentId: g.studentId,
    gameType: g.gameType,
    theme: g.theme,
    subject: g.subject,
    topic: g.topic,
    language: g.language,
    status: g.status as GameStatus,
    error: g.error,
    spec: (g.spec as GameSpec | null) ?? null,
    shellVersion: g.shellVersion,
    thumbnailUrl: g.thumbnailUrl,
    bestScore: g.bestScore,
    playCount: g.playCount,
    lastPlayedAt: g.lastPlayedAt,
    createdAt: g.createdAt,
    deletedAt: g.deletedAt,
  });

  const store: Store = {
    kind: 'prisma',

    async ping() {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      } catch {
        return false;
      }
    },

    async createStudent(data) {
      return (await prisma.student.create({ data })) as StudentRow;
    },
    async getStudentByToken(tokenHash) {
      return (await prisma.student.findUnique({ where: { tokenHash } })) as StudentRow | null;
    },
    async getStudent(id) {
      return (await prisma.student.findUnique({ where: { id } })) as StudentRow | null;
    },
    async getStudentByInstallationId(installationId) {
      return (await prisma.student.findUnique({ where: { installationId } })) as StudentRow | null;
    },
    async updateStudent(id, patch) {
      return (await prisma.student.update({ where: { id }, data: patch })) as StudentRow;
    },

    async createGame(data) {
      return toGame(await prisma.game.create({ data: { ...data, spec: data.spec ?? undefined } }));
    },
    async getGame(id) {
      const g = await prisma.game.findUnique({ where: { id } });
      return g ? toGame(g) : null;
    },
    async updateGame(id, patch) {
      const data: AnyPrisma = { ...patch };
      if ('spec' in data && data.spec === null) data.spec = undefined;
      return toGame(await prisma.game.update({ where: { id }, data }));
    },
    async listGames(studentId, opts) {
      const where = { studentId, deletedAt: null };
      const [items, total] = await Promise.all([
        prisma.game.findMany({
          where,
          orderBy: [{ lastPlayedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
          take: opts.limit,
          skip: opts.offset,
        }),
        prisma.game.count({ where }),
      ]);
      return { items: items.map(toGame), total };
    },

    async createPlaySession(data) {
      return (await prisma.playSession.create({ data })) as PlaySessionRow;
    },
    async recentPlaySessions(studentId, limit) {
      return (await prisma.playSession.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })) as PlaySessionRow[];
    },
    async playSessionsSince(studentId, since) {
      return (await prisma.playSession.findMany({
        where: { studentId, createdAt: { gte: since } },
      })) as PlaySessionRow[];
    },

    async upsertLearnProgress(studentId, pathId, experienceId) {
      const where = { studentId_pathId_experienceId: { studentId, pathId, experienceId } };
      const existing = await prisma.learnProgress.findUnique({ where });
      if (existing) return { row: existing as LearnProgressRow, created: false };
      const row = (await prisma.learnProgress.create({
        data: { studentId, pathId, experienceId },
      })) as LearnProgressRow;
      return { row, created: true };
    },
    async listLearnProgress(studentId) {
      return (await prisma.learnProgress.findMany({
        where: { studentId },
        orderBy: { completedAt: 'asc' },
      })) as LearnProgressRow[];
    },

    async upsertLearnEvidence(studentId: string, events: LearnEvidenceInput[]) {
      if (events.length === 0) return { accepted: 0 };
      // Idempotent by client-generated id — skipDuplicates makes a replayed
      // batch (offline retry, cross-device sync) a no-op for seen ids.
      const res = await prisma.learnEvidence.createMany({
        data: events.map((e) => ({ ...e, studentId })),
        skipDuplicates: true,
      });
      return { accepted: res.count };
    },
    async listLearnEvidence(studentId: string, since?: Date) {
      return (await prisma.learnEvidence.findMany({
        where: { studentId, ...(since ? { createdAt: { gte: since } } : {}) },
        orderBy: { createdAt: 'asc' },
      })) as LearnEvidenceRow[];
    },

    async createTutorMessage(data) {
      return (await prisma.tutorMessage.create({
        data: { ...data, context: data.context ?? undefined },
      })) as TutorMessageRow;
    },
    async listTutorMessages(studentId, conversationId, limit) {
      const rows = (await prisma.tutorMessage.findMany({
        where: { studentId, conversationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })) as TutorMessageRow[];
      return rows.reverse(); // oldest first, newest kept
    },

    async addXpEvent(studentId, amount, reason) {
      return (await prisma.xpEvent.create({ data: { studentId, amount, reason } })) as XpEventRow;
    },
    async listXpEvents(studentId, limit) {
      return (await prisma.xpEvent.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })) as XpEventRow[];
    },
    async addStreakDay(studentId, day) {
      const dayOnly = new Date(day.toISOString().slice(0, 10));
      try {
        await prisma.streakEvent.create({ data: { id: randomUUID(), studentId, day: dayOnly } });
        return true;
      } catch {
        return false; // unique violation — already recorded today
      }
    },

    async cacheGet(key) {
      const hit = await prisma.specCache.findUnique({ where: { key } });
      if (!hit || hit.expiresAt < new Date()) return null;
      return hit.content as Record<string, unknown>;
    },
    async cacheSet(key, content, ttlMs) {
      const expiresAt = new Date(Date.now() + ttlMs);
      await prisma.specCache.upsert({
        where: { key },
        update: { content, expiresAt },
        create: { key, content, expiresAt },
      });
    },
  };
  return store;
}
