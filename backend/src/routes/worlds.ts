/**
 * /api/v1/worlds — Lesson Worlds: create (one combined plan + stage-1 call),
 * map state, per-stage spec with prefetch-on-fetch, idempotent stage
 * generation kicks, and stage session recording (stars + XP + streak).
 *
 * Prefetch protocol: fetching stage N's spec kicks generation of stage N+1
 * in the background, so the next stage is ready before the child finishes
 * playing. Weak internet falls back to the client's building screen polling
 * the same spec endpoint (202 + retry-after, same rhythm as games).
 */
import type { FastifyInstance } from 'fastify';
import type { Student, WorldPlanContent } from '@edumind/shared';
import { recordSession } from './session_helper.js';
import { makeAuthHook } from '../auth.js';
import { gameGenGrade } from '../learning/stage.js';
import { config } from '../config.js';
import { moderate } from '../llm/moderation.js';
import { metrics } from '../pipeline/metrics.js';
import type { ContentProvider } from '../pipeline/provider.js';
import { generateStageSpec, generateWorldPlan, type StageParams } from '../pipeline/worlds.js';
import { CreateWorldBody, PostSessionBody } from '../schemas.js';
import type { Store, StudentRow, WorldRow, WorldStageRow } from '../store/types.js';

const worldTimestamps = new Map<string, number[]>(); // studentId → epoch ms
const stageJobs = new Set<string>(); // `${worldId}:${index}` — in-flight dedup

function studentBlock(s: StudentRow): Student {
  return {
    name: s.name,
    gender: (s.gender as 'm' | 'f' | null) ?? null,
    color: s.color,
    ...(s.interest ? { interest: s.interest as Student['interest'] } : {}),
  };
}

export function worldView(w: WorldRow) {
  return {
    id: w.id,
    lessonId: w.lessonId,
    subject: w.subject,
    topic: w.topic,
    language: w.language,
    grade: w.grade,
    status: w.status,
    error: w.error,
    title: w.title,
    arc: w.plan?.arc ?? null,
    stageCount: w.plan?.stages.length ?? 0,
    createdAt: w.createdAt.toISOString(),
  };
}

function stageView(row: WorldStageRow, plan: WorldPlanContent | null) {
  const planned = plan?.stages[row.index - 1];
  return {
    index: row.index,
    status: row.status,
    error: row.error,
    stars: row.stars,
    bestAccuracy: row.bestAccuracy,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    focus: planned?.focus ?? null,
    beat: planned?.beat ?? null,
    gameType: planned?.gameType ?? null,
    variant: planned?.variant ?? null,
    theme: planned?.theme ?? null,
    kit: planned?.kit ?? null,
    learningLevel: planned?.learningLevel ?? null,
    ramp: planned?.ramp ?? null,
  };
}

/** 3-star band from session accuracy — a learning signal, never a currency. */
export function starsForAccuracy(accuracy: number): number {
  return accuracy >= 0.85 ? 3 : accuracy >= 0.55 ? 2 : 1;
}

export async function worldRoutes(
  app: FastifyInstance,
  opts: { store: Store; provider: ContentProvider },
) {
  const { store, provider } = opts;
  const auth = makeAuthHook(store);
  const err = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }, reqId: string, status: number, code: string, message: string) =>
    reply.code(status).send({ error: { code, message, requestId: reqId } });

  const deps = { store, provider, log: app.log };

  /** Everything generateStageSpec needs, derived from a world row. */
  function stageParamsFor(world: WorldRow, student: StudentRow, index: number, performanceNote: string | null): StageParams {
    const plan = world.plan!;
    return {
      world: {
        id: world.id,
        title: world.title ?? plan.title,
        subject: world.subject,
        topic: world.topic,
        language: world.language as 'en' | 'ar',
        grade: world.grade,
        arc: plan.arc,
        summaryHints: plan.summaryHints,
      },
      stagePlan: plan.stages[index - 1]!,
      stageIndex: index,
      stageCount: plan.stages.length,
      student: studentBlock(student),
      previousBeat: index > 1 ? plan.stages[index - 2]!.beat : null,
      performanceNote,
    };
  }

  /** Coarse adaptive note from the previous stage's best run (cache-safe). */
  async function performanceNoteFor(worldId: string, index: number): Promise<string | null> {
    if (index <= 1) return null;
    const prev = await store.getWorldStage(worldId, index - 1);
    if (!prev || prev.bestAccuracy == null) return null;
    if (prev.bestAccuracy >= 0.85) return 'the child aced the previous stage';
    if (prev.bestAccuracy < 0.5) return 'the child struggled on the previous stage';
    return null;
  }

  /** Fire-and-forget stage generation with in-flight dedup. */
  function kickStageJob(world: WorldRow, student: StudentRow, index: number) {
    const plan = world.plan;
    if (!plan || index < 1 || index > plan.stages.length) return;
    const jobKey = `${world.id}:${index}`;
    if (stageJobs.has(jobKey)) return;
    stageJobs.add(jobKey);
    void (async () => {
      try {
        const row = await store.getWorldStage(world.id, index);
        if (!row || row.status === 'ready' || row.status === 'generating') return;
        await store.updateWorldStage(world.id, index, { status: 'generating', error: null });
        const note = await performanceNoteFor(world.id, index);
        const result = await generateStageSpec(deps, stageParamsFor(world, student, index, note));
        await store.updateWorldStage(world.id, index, {
          status: 'ready',
          spec: result.spec,
          error: null,
          generatedAt: new Date(),
        });
        app.log.info(`[worlds] ${world.id} stage ${index} ready (cache=${result.fromCache}, model=${result.model})`);
      } catch (e) {
        await store.updateWorldStage(world.id, index, { status: 'failed', error: (e as Error).message }).catch(() => {});
        app.log.error(`[worlds] ${world.id} stage ${index} failed: ${(e as Error).message}`);
      } finally {
        stageJobs.delete(jobKey);
      }
    })();
  }

  // ------------------------------------------------------------- create
  app.post('/api/v1/worlds', { preHandler: auth }, async (req, reply) => {
    const parsed = CreateWorldBody.safeParse(req.body);
    if (!parsed.success) {
      return err(reply, req.id, 400, 'BAD_REQUEST', parsed.error.issues[0]?.message ?? 'invalid body');
    }
    const body = parsed.data;
    const student = req.student!;
    const language = (body.language ?? student.language) as 'en' | 'ar';

    // per-student world-creation rate limit
    const now = Date.now();
    const stamps = (worldTimestamps.get(student.id) ?? []).filter((t) => now - t < 3_600_000);
    if (stamps.length >= config.maxWorldsPerHour) {
      return err(reply, req.id, 429, 'RATE_LIMITED', 'too many new worlds this hour — keep exploring the ones you have!');
    }

    // moderation pre-check on raw inputs
    const mod = await moderate([body.topic, body.subject ?? ''], app.log);
    if (mod.flagged) {
      metrics.bump('moderation_pre_flagged');
      return err(reply, req.id, 422, 'TOPIC_REJECTED', 'that topic cannot be turned into a lesson world');
    }

    // normalize (may ask ONE clarifying question instead of creating a world)
    const normalized = await provider.normalize({
      subject: body.subject,
      topic: body.topic,
      language,
      grade: gameGenGrade(student.grade),
    });
    if (normalized.data.clarifyingQuestion && normalized.data.confidence < 0.5) {
      return reply.code(200).send({
        worldId: null,
        status: 'clarify',
        clarifyingQuestion: normalized.data.clarifyingQuestion,
      });
    }

    stamps.push(now);
    worldTimestamps.set(student.id, stamps);

    // ONE combined call: the plan + stage-1 content.
    let planResult;
    try {
      planResult = await generateWorldPlan(deps, {
        subject: normalized.data.subject,
        topic: normalized.data.topic,
        language,
        grade: gameGenGrade(student.grade),
        focusConcepts: body.focusConcepts,
        notes: normalized.data.notes ?? null,
        preEscalate: normalized.data.complexity > 0.7 || normalized.data.confidence < 0.6,
      });
    } catch (e) {
      return err(reply, req.id, 502, 'WORLD_PLAN_FAILED', (e as Error).message);
    }

    const world = await store.createWorld({
      id: crypto.randomUUID(),
      studentId: student.id,
      lessonId: body.lessonId ?? null,
      subject: normalized.data.subject,
      topic: normalized.data.topic,
      language,
      grade: gameGenGrade(student.grade),
      status: 'ready',
      error: null,
      title: planResult.plan.title,
      plan: planResult.plan,
    });
    for (let i = 1; i <= planResult.plan.stages.length; i++) {
      await store.upsertWorldStage({
        worldId: world.id,
        index: i,
        status: 'planned',
        error: null,
        spec: null,
        stars: null,
        bestAccuracy: null,
        completedAt: null,
        generatedAt: null,
      });
    }

    // Stage 1's content arrived with the plan — gate it through the exact
    // same validation/fact-check/moderation pipeline, synchronously, so the
    // response carries a playable stage (worlds open with zero extra waits).
    let stage1Spec = null;
    try {
      const result = await generateStageSpec(deps, {
        ...stageParamsFor(world, student, 1, null),
        presupplied: planResult.stage1Content,
      });
      await store.updateWorldStage(world.id, 1, {
        status: 'ready',
        spec: result.spec,
        generatedAt: new Date(),
      });
      stage1Spec = result.spec;
    } catch (e) {
      // The plan survives; stage 1 regenerates via the generate endpoint.
      await store.updateWorldStage(world.id, 1, { status: 'failed', error: (e as Error).message }).catch(() => {});
      app.log.error(`[worlds] ${world.id} stage 1 gating failed: ${(e as Error).message}`);
    }

    const stages = await store.listWorldStages(world.id);
    return reply.code(201).send({
      worldId: world.id,
      status: 'ready',
      clarifyingQuestion: null,
      world: worldView(world),
      stages: stages.map((s) => stageView(s, world.plan)),
      stage1Spec,
    });
  });

  // ------------------------------------------------------ list + map state
  async function ownedWorld(req: { student?: StudentRow }, id: string) {
    const w = await store.getWorld(id);
    if (!w || w.studentId !== req.student!.id) return null;
    return w;
  }

  app.get('/api/v1/worlds', { preHandler: auth }, async (req) => {
    const q = req.query as { limit?: string; offset?: string };
    const limit = Math.min(Number(q.limit) || 50, 100);
    const offset = Number(q.offset) || 0;
    const { items, total } = await store.listWorlds(req.student!.id, { limit, offset });
    return { items: items.map(worldView), total, limit, offset };
  });

  app.get('/api/v1/worlds/:id', { preHandler: auth }, async (req, reply) => {
    const w = await ownedWorld(req, (req.params as { id: string }).id);
    if (!w) return err(reply, req.id, 404, 'NOT_FOUND', 'world not found');
    const stages = await store.listWorldStages(w.id);
    return { ...worldView(w), stages: stages.map((s) => stageView(s, w.plan)) };
  });

  // --------------------------------------------- stage spec (+ prefetch)
  app.get('/api/v1/worlds/:id/stages/:n/spec', { preHandler: auth }, async (req, reply) => {
    const { id, n } = req.params as { id: string; n: string };
    const index = Number(n);
    const w = await ownedWorld(req, id);
    if (!w || !w.plan) return err(reply, req.id, 404, 'NOT_FOUND', 'world not found');
    if (!Number.isInteger(index) || index < 1 || index > w.plan.stages.length) {
      return err(reply, req.id, 404, 'NOT_FOUND', 'stage not found');
    }
    const stage = await store.getWorldStage(w.id, index);
    if (!stage) return err(reply, req.id, 404, 'NOT_FOUND', 'stage not found');

    if (stage.status === 'ready' && stage.spec) {
      // PREFETCH: the child is about to play stage N — bake stage N+1 now.
      kickStageJob(w, req.student!, index + 1);
      return stage.spec;
    }
    if (stage.status === 'failed') {
      return err(reply, req.id, 410, 'GENERATION_FAILED', stage.error ?? 'stage generation failed — retry');
    }
    // planned (prefetch never ran — server restart / first tap) or already
    // generating: kick idempotently and tell the client to poll.
    kickStageJob(w, req.student!, index);
    return reply.code(202).header('retry-after', '2').send({ status: 'generating' });
  });

  // ----------------------------------------------- idempotent generate kick
  app.post('/api/v1/worlds/:id/stages/:n/generate', { preHandler: auth }, async (req, reply) => {
    const { id, n } = req.params as { id: string; n: string };
    const index = Number(n);
    const w = await ownedWorld(req, id);
    if (!w || !w.plan) return err(reply, req.id, 404, 'NOT_FOUND', 'world not found');
    if (!Number.isInteger(index) || index < 1 || index > w.plan.stages.length) {
      return err(reply, req.id, 404, 'NOT_FOUND', 'stage not found');
    }
    const stage = await store.getWorldStage(w.id, index);
    if (!stage) return err(reply, req.id, 404, 'NOT_FOUND', 'stage not found');
    if (stage.status === 'ready') return { status: 'ready' };
    if (stage.status === 'failed') {
      // reset so the kick regenerates
      await store.updateWorldStage(w.id, index, { status: 'planned', error: null });
    }
    kickStageJob(w, req.student!, index);
    return { status: 'generating' };
  });

  // -------------------------------------------------- stage session (result)
  app.post('/api/v1/worlds/:id/stages/:n/sessions', { preHandler: auth }, async (req, reply) => {
    const { id, n } = req.params as { id: string; n: string };
    const index = Number(n);
    const w = await ownedWorld(req, id);
    if (!w || !w.plan) return err(reply, req.id, 404, 'NOT_FOUND', 'world not found');
    const stage = await store.getWorldStage(w.id, index);
    if (!stage) return err(reply, req.id, 404, 'NOT_FOUND', 'stage not found');
    const parsed = PostSessionBody.safeParse(req.body);
    if (!parsed.success) {
      return err(reply, req.id, 400, 'BAD_REQUEST', parsed.error.issues[0]?.message ?? 'invalid body');
    }

    // XP, streak and enriched feedback ride the shared session pipeline.
    const session = await recordSession(deps, req.student!, null, parsed.data.summary);

    const accuracy = Math.max(0, Math.min(1, Number(parsed.data.summary.accuracy) || 0));
    const stars = starsForAccuracy(accuracy);
    await store.updateWorldStage(w.id, index, {
      stars: Math.max(stage.stars ?? 0, stars),
      bestAccuracy: Math.max(stage.bestAccuracy ?? 0, accuracy),
      completedAt: stage.completedAt ?? new Date(),
    });

    // Belt-and-braces prefetch: finishing stage N also bakes stage N+1.
    kickStageJob(w, req.student!, index + 1);

    return reply.code(201).send({ ...session, stars });
  });
}
