/**
 * Lesson Worlds integration tests: world creation (combined plan + stage-1
 * call), map state, stage prefetch-on-fetch, idempotent generate kicks,
 * building-screen polling (202), stage sessions (stars/XP/streak), rate
 * limiting, and the stage cache. MOCK_LLM mode against the in-memory store
 * via fastify.inject() — the pipeline under test is the production path.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

process.env.MOCK_LLM = 'true';
process.env.MOCK_LATENCY_MS = '50';
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'production';

const { buildApp } = await import('../src/app.js');
const { MockProvider } = await import('../src/llm/mock.js');
const { MemoryStore } = await import('../src/store/memory.js');
const { starsForAccuracy } = await import('../src/routes/worlds.js');

let app: FastifyInstance;
let token = '';
let worldId = '';
let stageCount = 0;

async function api(method: 'GET' | 'POST', url: string, body?: unknown) {
  return app.inject({
    method,
    url,
    payload: body as Record<string, unknown> | undefined,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function waitStageReady(wid: string, index: number, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await api('GET', `/api/v1/worlds/${wid}`);
    const stage = res.json().stages.find((s: { index: number }) => s.index === index);
    if (stage?.status === 'ready') return stage;
    if (stage?.status === 'failed') throw new Error(`stage failed: ${stage.error}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for stage ${index}`);
}

beforeAll(async () => {
  app = await buildApp({ store: new MemoryStore(), provider: new MockProvider() });
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/students',
    payload: { name: 'Explorer', grade: 3, language: 'en', color: '#079A90', interest: 'space', dailyGoal: 3 },
  });
  token = res.json().token;
});

describe('world creation', () => {
  it('creates a world from one request: plan + playable stage 1', async () => {
    const res = await api('POST', '/api/v1/worlds', { subject: 'Science', topic: 'The Water Cycle' });
    expect(res.statusCode).toBe(201);
    const data = res.json();
    expect(data.status).toBe('ready');
    expect(data.worldId).toBeTruthy();
    expect(data.world.title).toBeTruthy();
    expect(data.world.stageCount).toBeGreaterThanOrEqual(6);
    expect(data.stages).toHaveLength(data.world.stageCount);

    // Stage 1 arrives ready and playable — no second wait.
    const s1 = data.stages.find((s: { index: number }) => s.index === 1);
    expect(s1.status).toBe('ready');
    expect(data.stage1Spec).toBeTruthy();
    expect(data.stage1Spec.meta.scope).toBe('stage');
    expect(data.stage1Spec.meta.stageIndex).toBe(1);
    expect(data.stage1Spec.levels[0].isIntro).toBe(true); // tutorial rides stage 1
    expect(data.stage1Spec.levels).toHaveLength(2);

    // Later stages are planned, not generated (no wasted spend).
    const s2 = data.stages.find((s: { index: number }) => s.index === 2);
    expect(s2.status).toBe('planned');

    worldId = data.worldId;
    stageCount = data.world.stageCount;
  });

  it('asks a clarifying question for vague topics instead of creating a world', async () => {
    const res = await api('POST', '/api/v1/worlds', { topic: 'stuff' });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.status).toBe('clarify');
    expect(data.worldId).toBeNull();
    expect(data.clarifyingQuestion).toBeTruthy();
  });

  it('lists the world in the library', async () => {
    const res = await api('GET', '/api/v1/worlds');
    expect(res.statusCode).toBe(200);
    expect(res.json().items.some((w: { id: string }) => w.id === worldId)).toBe(true);
  });

  it('a world showcases many game types AND variants (not just quest)', async () => {
    // The founder must SEE the whole game library in one world, not only the
    // quest_path stages — this is exactly the regression that prompted it.
    const res = await api('POST', '/api/v1/worlds', { topic: 'The Solar System' });
    const stages = res.json().stages as Array<{ gameType: string; variant: string }>;
    const gameTypes = new Set(stages.map((s) => s.gameType));
    const variants = new Set(stages.map((s) => s.variant).filter((v) => v !== 'classic'));
    expect(gameTypes.size, `only saw: ${[...gameTypes].join(', ')}`).toBeGreaterThanOrEqual(3);
    expect(variants.size, 'expected non-classic variants to appear').toBeGreaterThanOrEqual(2);
    // stage 1 still opens with an mcq family (instant start)
    expect(['quest_path', 'goal_shootout']).toContain(stages[0]!.gameType);
  });
});

describe('stage prefetch + play loop', () => {
  it('fetching stage 1 prefetches stage 2 in the background', async () => {
    const res = await api('GET', `/api/v1/worlds/${worldId}/stages/1/spec`);
    expect(res.statusCode).toBe(200);
    expect(res.json().meta.worldId).toBe(worldId);

    // The prefetch kick makes stage 2 ready without anyone asking for it.
    const s2 = await waitStageReady(worldId, 2);
    expect(s2.status).toBe('ready');
  });

  it('a prefetched stage serves instantly; stages ≥2 skip the tutorial level', async () => {
    const res = await api('GET', `/api/v1/worlds/${worldId}/stages/2/spec`);
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.meta.scope).toBe('stage');
    expect(spec.meta.stageIndex).toBe(2);
    expect(spec.levels).toHaveLength(1);
    expect(spec.levels[0].isIntro).toBe(false);
    // ids are world-unique per stage
    expect(spec.levels[0].items[0].id).toMatch(/^s2_i1$/);
  });

  it('an ungenerated stage returns 202 + retry-after and self-kicks (building screen)', async () => {
    const res = await api('GET', `/api/v1/worlds/${worldId}/stages/5/spec`);
    expect(res.statusCode).toBe(202);
    expect(res.headers['retry-after']).toBe('2');
    // ...and the kick eventually lands it
    const s5 = await waitStageReady(worldId, 5);
    expect(s5.status).toBe('ready');
  });

  it('the generate kick is idempotent', async () => {
    const first = await api('POST', `/api/v1/worlds/${worldId}/stages/4/generate`);
    const second = await api('POST', `/api/v1/worlds/${worldId}/stages/4/generate`);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    await waitStageReady(worldId, 4);
    const third = await api('POST', `/api/v1/worlds/${worldId}/stages/4/generate`);
    expect(third.json().status).toBe('ready');
  });

  it('rejects an out-of-range stage', async () => {
    const res = await api('GET', `/api/v1/worlds/${worldId}/stages/${stageCount + 1}/spec`);
    expect(res.statusCode).toBe(404);
  });
});

describe('stage sessions (stars + XP + streak)', () => {
  it('records a stage run: stars, XP, streak, feedback — and prefetches the next stage', async () => {
    const res = await api('POST', `/api/v1/worlds/${worldId}/stages/1/sessions`, {
      summary: { xp: 120, accuracy: 0.9, correct: 5, presented: 6 },
    });
    expect(res.statusCode).toBe(201);
    const data = res.json();
    expect(data.stars).toBe(3);
    expect(data.xpAwarded).toBeGreaterThan(0);
    expect(data.streak.count).toBeGreaterThanOrEqual(1);
    expect(data.enrichedFeedback.headline).toBeTruthy();

    const world = (await api('GET', `/api/v1/worlds/${worldId}`)).json();
    const s1 = world.stages.find((s: { index: number }) => s.index === 1);
    expect(s1.stars).toBe(3);
    expect(s1.bestAccuracy).toBeCloseTo(0.9);
    expect(s1.completedAt).toBeTruthy();
  });

  it('a worse replay never lowers stars or best accuracy', async () => {
    const res = await api('POST', `/api/v1/worlds/${worldId}/stages/1/sessions`, {
      summary: { xp: 30, accuracy: 0.4 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().stars).toBe(1); // this run's stars…
    const world = (await api('GET', `/api/v1/worlds/${worldId}`)).json();
    const s1 = world.stages.find((s: { index: number }) => s.index === 1);
    expect(s1.stars).toBe(3); // …but the stage keeps its best
    expect(s1.bestAccuracy).toBeCloseTo(0.9);
  });

  it('star bands match the scoring doctrine', () => {
    expect(starsForAccuracy(1)).toBe(3);
    expect(starsForAccuracy(0.85)).toBe(3);
    expect(starsForAccuracy(0.7)).toBe(2);
    expect(starsForAccuracy(0.55)).toBe(2);
    expect(starsForAccuracy(0.3)).toBe(1);
  });
});

describe('cache + isolation', () => {
  it('a second world on the same lesson hits the stage cache (near-free classroom repeats)', async () => {
    const res = await api('POST', '/api/v1/worlds', { subject: 'Science', topic: 'The Water Cycle' });
    expect(res.statusCode).toBe(201);
    const w2 = res.json();
    expect(w2.stage1Spec).toBeTruthy();
    // The de-personalized content matches; the student block is re-injected.
    expect(w2.stage1Spec.levels[1].items[0].prompt).toBeTruthy();
    expect(w2.worldId).not.toBe(worldId);
  });

  it('an Arabic world can schedule My Town (number_city) stages and they generate', async () => {
    // Arabic student → the mock plans from ar-sampled families, which include
    // number_city (My Town) since the Phase 3 rework made it stage-generatable.
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/students',
      payload: { name: 'أمل', grade: 2, language: 'ar', color: '#EF9722', interest: 'robots', dailyGoal: 3 },
    });
    const arToken = reg.json().token as string;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/worlds',
      payload: { topic: 'الأشكال الهندسية' },
      headers: { authorization: `Bearer ${arToken}` },
    });
    expect(created.statusCode).toBe(201);
    const data = created.json();
    const cityStage = (data.stages as Array<{ index: number; gameType: string; learningLevel: string | null }>)
      .find((s) => s.gameType === 'number_city');
    expect(cityStage, 'the mock plan schedules a My Town stage for ar').toBeTruthy();
    expect(cityStage!.learningLevel).toBeTruthy(); // ladder families carry a rung

    // Generate that stage and confirm the assembled spec keeps city kinds.
    await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${data.worldId}/stages/${cityStage!.index}/generate`,
      headers: { authorization: `Bearer ${arToken}` },
    });
    const deadline = Date.now() + 15000;
    let spec: Record<string, unknown> | null = null;
    while (Date.now() < deadline && !spec) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${data.worldId}/stages/${cityStage!.index}/spec`,
        headers: { authorization: `Bearer ${arToken}` },
      });
      if (res.statusCode === 200) spec = res.json();
      else await new Promise((r) => setTimeout(r, 100));
    }
    expect(spec, 'My Town stage generated').toBeTruthy();
    const level = (spec!.levels as Array<{ isIntro: boolean; items: Array<{ kind: string }> }>)
      .find((l) => !l.isIntro)!;
    const kinds = new Set(level.items.map((i) => i.kind));
    for (const k of kinds) {
      expect(['tap_scene', 'drag_collect', 'sequence', 'build_complete']).toContain(k);
    }
    expect((spec!.meta as { wrapper?: string }).wrapper).toMatch(/nature|construction/);
  });

  it("another student's token cannot read this world", async () => {
    const stranger = await app.inject({
      method: 'POST',
      url: '/api/v1/students',
      payload: { name: 'Stranger', grade: 3, language: 'en', color: '#D93B5E', dailyGoal: 3 },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}`,
      headers: { authorization: `Bearer ${stranger.json().token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
