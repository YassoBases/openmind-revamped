/**
 * Middle-school learning-progress routes — the backend half of the client's
 * LearnProgressStore. Local storage stays the instant offline source; these
 * endpoints make completion survive reinstalls and travel across devices.
 * Progress lives in its own domain (LearnProgress), never mixed with games.
 */
import type { FastifyInstance } from 'fastify';
import { makeAuthHook } from '../auth.js';
import { PostLearnEvidenceBody, PutLearnProgressBody } from '../schemas.js';
import type { LearnEvidenceInput, Store } from '../store/types.js';

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

  // ---- evidence log (per-skill readiness) ----------------------------------
  // The backend half of the client's LearnEvidenceStore — same local-first,
  // append-only, union-by-id doctrine as progress. Readiness is always DERIVED
  // from this log; nothing here stores a readiness verdict.

  // The student's evidence, oldest first. Optional ?since=ISO for incremental
  // pulls (the client already caps its local log).
  app.get('/api/v1/learn/evidence', { preHandler: auth }, async (req) => {
    const since = typeof (req.query as { since?: string })?.since === 'string'
      ? new Date((req.query as { since: string }).since)
      : undefined;
    const validSince = since && !Number.isNaN(since.getTime()) ? since : undefined;
    const rows = await store.listLearnEvidence(req.student!.id, validSince);
    return {
      items: rows.map((r) => ({ ...r, studentId: undefined, createdAt: r.createdAt.toISOString() })),
      total: rows.length,
    };
  });

  // Idempotent batch append (deduped by client-generated event id).
  app.post('/api/v1/learn/evidence', { preHandler: auth }, async (req, reply) => {
    const parsed = PostLearnEvidenceBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid body', requestId: req.id },
      });
    }
    const events: LearnEvidenceInput[] = parsed.data.events.map((e) => ({
      id: e.id,
      skillId: e.skillId,
      representation: e.representation,
      context: e.context ?? null,
      source: e.source,
      kind: e.kind,
      outcome: e.outcome,
      verification: e.verification,
      attempt: e.attempt ?? 1,
      hints: e.hints ?? 0,
      recovered: e.recovered ?? false,
      errorPattern: e.errorPattern ?? null,
      toolId: e.toolId ?? null,
      pathId: e.pathId ?? null,
      experienceId: e.experienceId ?? null,
      stepIndex: e.stepIndex ?? null,
      ms: e.ms ?? null,
      createdAt: new Date(e.createdAt),
    }));
    const { accepted } = await store.upsertLearnEvidence(req.student!.id, events);
    const total = (await store.listLearnEvidence(req.student!.id)).length;
    return reply.code(201).send({ accepted, total });
  });
}
