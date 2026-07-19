/**
 * Stage-based product rule tests: one app, two stage-appropriate learning
 * experiences. Covers the stage resolver, Grade 7 end-to-end identity, the
 * middle-school learningContext preference, the learn-progress domain, and
 * the tutor receiving trusted stage/context — all via fastify.inject()
 * against the in-memory store in MOCK_LLM mode, same harness as api.test.ts.
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
const { stageForGrade, gameGenGrade, LEARNING_CONTEXTS } = await import('../src/learning/stage.js');

let app: FastifyInstance;

async function createStudent(payload: Record<string, unknown>) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/students', payload });
  return res;
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  app = await buildApp({ store: new MemoryStore(), provider: new MockProvider() });
});

describe('stage resolver', () => {
  it('maps grades 1-6 to primary_games and 7-9 to middle_interactive_learning', () => {
    for (const g of [1, 2, 3, 4, 5, 6]) expect(stageForGrade(g)).toBe('primary_games');
    for (const g of [7, 8, 9]) expect(stageForGrade(g)).toBe('middle_interactive_learning');
  });

  it('clamps only at the game-generation boundary', () => {
    expect(gameGenGrade(7)).toBe(6);
    expect(gameGenGrade(9)).toBe(6);
    expect(gameGenGrade(3)).toBe(3);
  });
});

describe('grade 7 identity end-to-end', () => {
  let token = '';

  it('registers a Grade 7 student as Grade 7 with the middle stage', async () => {
    const res = await createStudent({
      name: 'ليان', grade: 7, language: 'ar', color: '#1CB0F6', dailyGoal: 3,
    });
    expect(res.statusCode).toBe(201);
    const { student } = res.json();
    token = res.json().token;
    expect(student.grade).toBe(7);
    expect(student.stage).toBe('middle_interactive_learning');
    expect(student.learningContext).toBeNull();
  });

  it('keeps grade 7 and stage on /students/me', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/students/me', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().grade).toBe(7);
    expect(res.json().stage).toBe('middle_interactive_learning');
  });

  it('still rejects grades outside 1-9', async () => {
    expect((await createStudent({ name: 'X', grade: 0, language: 'en', dailyGoal: 3 })).statusCode).toBe(400);
    expect((await createStudent({ name: 'X', grade: 10, language: 'en', dailyGoal: 3 })).statusCode).toBe(400);
  });

  it('a grade 5 student resolves to primary_games', async () => {
    const res = await createStudent({ name: 'Sami', grade: 5, language: 'en', color: '#58CC02', dailyGoal: 3 });
    expect(res.statusCode).toBe(201);
    expect(res.json().student.stage).toBe('primary_games');
  });

  it('grade 7 can still create an elementary game (clamped at the generation boundary only)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/games',
      headers: bearer(token),
      payload: { topic: 'Photosynthesis', subject: 'Science', gameType: 'quest_path', theme: 'sci_fi', sessionLength: 5, difficulty: 'normal' },
    });
    expect(res.statusCode).toBe(201);
    // identity stays 7 even after touching the game pipeline
    const me = await app.inject({ method: 'GET', url: '/api/v1/students/me', headers: bearer(token) });
    expect(me.json().grade).toBe(7);
  });
});

describe('middle-school learningContext preference', () => {
  let token = '';

  beforeAll(async () => {
    const res = await createStudent({ name: 'نور', grade: 7, language: 'ar', dailyGoal: 3 });
    token = res.json().token;
  });

  it('accepts a supported context via PATCH and returns it on the profile', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/students/me',
      headers: bearer(token),
      payload: { learningContext: 'market' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().learningContext).toBe('market');

    const me = await app.inject({ method: 'GET', url: '/api/v1/students/me', headers: bearer(token) });
    expect(me.json().learningContext).toBe('market');
  });

  it('a partial PATCH never resets untouched fields to defaults', async () => {
    const res = await createStudent({ name: 'رنا', grade: 8, language: 'ar', color: '#1CB0F6', dailyGoal: 5 });
    const t = res.json().token;
    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/v1/students/me',
      headers: bearer(t),
      payload: { learningContext: 'building' },
    });
    expect(patched.statusCode).toBe(200);
    const s = patched.json();
    expect(s.learningContext).toBe('building');
    expect(s.language).toBe('ar'); // not reset to the create-schema default 'en'
    expect(s.color).toBe('#1CB0F6');
    expect(s.dailyGoal).toBe(5);
    expect(s.grade).toBe(8);
  });

  it('rejects an unsupported context value', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/students/me',
      headers: bearer(token),
      payload: { learningContext: 'unicorns' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('stays separate from the elementary interest field', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/students/me',
      headers: bearer(token),
      payload: { interest: 'space' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().interest).toBe('space');
    expect(res.json().learningContext).toBe('market'); // untouched

    // clearing the context does not clear the interest
    const clear = await app.inject({
      method: 'PATCH',
      url: '/api/v1/students/me',
      headers: bearer(token),
      payload: { learningContext: null },
    });
    expect(clear.json().learningContext).toBeNull();
    expect(clear.json().interest).toBe('space');
  });

  it('the tutor reply reflects the trusted server-stored context', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/students/me',
      headers: bearer(token),
      payload: { learningContext: 'water_energy' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tutor/messages',
      headers: bearer(token),
      payload: { question: 'كيف أحسب مساحة المثلث؟' },
    });
    expect(res.statusCode).toBe(201);
    // mock provider embeds the lens it received from the authenticated row —
    // as its LOCALIZED name, never the raw wire id inside an Arabic sentence.
    expect(res.json().reply.message).toContain('الماء والطاقة');
    expect(res.json().reply.message).not.toContain('water_energy');
  });

  it('a primary student gets the younger game-framed tutor voice', async () => {
    const young = await createStudent({ name: 'Lina', grade: 3, language: 'en', dailyGoal: 3 });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tutor/messages',
      headers: bearer(young.json().token),
      payload: { question: 'What is multiplication?' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().reply.message).toContain('level');
    expect(res.json().reply.message).not.toContain('lens');
  });

  it('exposes exactly the supported context list', () => {
    expect(LEARNING_CONTEXTS).toEqual(['market', 'building', 'water_energy', 'roads_transport', 'technology']);
  });
});

describe('learn progress (middle-school domain)', () => {
  let token = '';

  beforeAll(async () => {
    const res = await createStudent({ name: 'هدى', grade: 7, language: 'ar', dailyGoal: 3 });
    token = res.json().token;
  });

  it('starts empty', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/learn/progress', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [], total: 0 });
  });

  it('requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/learn/progress' });
    expect(res.statusCode).toBe(401);
  });

  it('records a completion and is idempotent on replay', async () => {
    const first = await app.inject({
      method: 'PUT',
      url: '/api/v1/learn/progress',
      headers: bearer(token),
      payload: { pathId: 'neighborhood_engineer', experienceId: 'triangle_garden' },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().alreadyCompleted).toBe(false);
    const stamp = first.json().completedAt;

    const replay = await app.inject({
      method: 'PUT',
      url: '/api/v1/learn/progress',
      headers: bearer(token),
      payload: { pathId: 'neighborhood_engineer', experienceId: 'triangle_garden' },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().alreadyCompleted).toBe(true);
    expect(replay.json().completedAt).toBe(stamp); // original timestamp preserved
    expect(replay.json().total).toBe(1);

    const list = await app.inject({ method: 'GET', url: '/api/v1/learn/progress', headers: bearer(token) });
    expect(list.json().total).toBe(1);
    expect(list.json().items[0].pathId).toBe('neighborhood_engineer');
    expect(list.json().items[0].experienceId).toBe('triangle_garden');
  });

  it('rejects an invalid body with the error envelope', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/learn/progress',
      headers: bearer(token),
      payload: { pathId: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('is private per student and separate from game progress', async () => {
    const other = await createStudent({ name: 'Omar', grade: 7, language: 'en', dailyGoal: 3 });
    const otherToken = other.json().token;

    const res = await app.inject({ method: 'GET', url: '/api/v1/learn/progress', headers: bearer(otherToken) });
    expect(res.json().total).toBe(0);

    // learning completion never leaks into the games library
    const games = await app.inject({ method: 'GET', url: '/api/v1/games/library', headers: bearer(token) });
    expect(games.statusCode).toBe(200);
    expect(games.json().total).toBe(0);
  });
});
