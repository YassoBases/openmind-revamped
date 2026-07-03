/**
 * Middle-school learning-progress routes — the backend half of the client's
 * LearnProgressStore. Local storage stays the instant offline source; these
 * endpoints make completion survive reinstalls and travel across devices.
 * Progress lives in its own domain (LearnProgress), never mixed with games.
 */
import type { FastifyInstance } from 'fastify';
import { makeAuthHook } from '../auth.js';
import { PutLearnProgressBody } from '../schemas.js';
import type { Store } from '../store/types.js';

export async function learnRoutes(app: FastifyInstance, opts: { store: Store }) {
  const { store } = opts;
  const auth = makeAuthHook(store);

  // All completed experiences of the authenticated student, oldest first.
  app.get('/api/v1/learn/progress', { preHandler: auth }, async (req) => {
    const rows = await store.listLearnProgress(req.student!.id);
    return {
      items: rows.map((r) => ({
        pathId: r.pathId,
        experienceId: r.experienceId,
        completedAt: r.completedAt.toISOString(),
      })),
      total: rows.length,
    };
  });

  // Mark one experience completed. Idempotent: replaying a finished
  // experience keeps the original completion timestamp.
  app.put('/api/v1/learn/progress', { preHandler: auth }, async (req, reply) => {
    const parsed = PutLearnProgressBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid body', requestId: req.id },
      });
    }
    const { pathId, experienceId } = parsed.data;
    const { row, created } = await store.upsertLearnProgress(req.student!.id, pathId, experienceId);
    const total = (await store.listLearnProgress(req.student!.id)).length;
    return reply.code(created ? 201 : 200).send({
      saved: true,
      alreadyCompleted: !created,
      completedAt: row.completedAt.toISOString(),
      total,
    });
  });
}
