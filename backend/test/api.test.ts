/**
 * Backend integration tests: full API flow in MOCK_LLM mode against the
 * in-memory store via fastify.inject() — onboarding, game creation,
 * progressive-start polling, spec retrieval, assembly, sessions/XP/streak,
 * review synthesis, refinement. The pipeline code under test (generator,
 * validators, assembly) is the production path; only the LLM is mocked.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

process.env.MOCK_LLM = 'true';
process.env.MOCK_LATENCY_MS = '50';
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'production'; // no pino-pretty transport in tests

const { buildApp } = await import('../src/app.js');
const { MockProvider } = await import('../src/llm/mock.js');
const { MemoryStore } = await import('../src/store/memory.js');

let app: FastifyInstance;
let token = '';
let studentId = '';
let gameId = '';

async function api(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) {
  return app.inject({
    method,
    url,
    payload: body as Record<string, unknown> | undefined,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function waitReady(id: string, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await api('GET', `/api/v1/games/${id}`);
    const data = res.json();
    if (data.status === 'ready') return data;
    if (data.status === 'failed') throw new Error(`generation failed: ${data.error}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timed out waiting for ready');
}

beforeAll(async () => {
  app = await buildApp({ store: new MemoryStore(), provider: new MockProvider() });
});

describe('health + docs', () => {
  it('reports health with db + llm mode', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.db).toBe('memory');
    expect(data.llm).toBe('mock');
  });

  it('serves the OpenAPI docs UI', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/docs' });
    expect([200, 302]).toContain(res.statusCode);
  });
});

describe('auth + students', () => {
  it('rejects unauthenticated requests with the error envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/students/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
    expect(res.json().error.requestId).toBeTruthy();
  });

  it('creates a nickname-only student and returns a token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/students',
      payload: { name: 'Testy', grade: 4, language: 'en', color: '#1CB0F6', interest: 'space', dailyGoal: 3 },
    });
    expect(res.statusCode).toBe(201);
    const data = res.json();
    expect(data.token).toMatch(/^emt_/);
    token = data.token;
    studentId = data.studentId;
  });

  it('GET/PATCH /students/me works with the token', async () => {
    const me = await api('GET', '/api/v1/students/me');
    expect(me.json().name).toBe('Testy');
    const patched = await api('PATCH', '/api/v1/students/me', { color: '#CE82FF' });
    expect(patched.json().color).toBe('#CE82FF');
  });
});

describe('game lifecycle (progressive start)', () => {
  it('asks ONE clarifying question for vague topics, creates nothing', async () => {
    const res = await api('POST', '/api/v1/games', {
      topic: 'stuff', gameType: 'quest_path', theme: 'fantasy', sessionLength: 5, difficulty: 'normal',
    });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.status).toBe('clarify');
    expect(data.clarifyingQuestion).toBeTruthy();
    expect(data.gameId).toBeNull();
  });

  it('rejects themes from another game type', async () => {
    const res = await api('POST', '/api/v1/games', {
      topic: 'photosynthesis', gameType: 'quest_path', theme: 'football', sessionLength: 5, difficulty: 'normal',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('THEME_INVALID');
  });

  it('creates a game and returns a stub spec immediately', async () => {
    const res = await api('POST', '/api/v1/games', {
      topic: 'Photosynthesis', subject: 'Science',
      gameType: 'quest_path', theme: 'sci_fi', sessionLength: 5, difficulty: 'normal',
    });
    expect(res.statusCode).toBe(201);
    const data = res.json();
    expect(data.status).toBe('generating');
    expect(data.stubSpec.stub).toBe(true);
    expect(data.stubSpec.meta.gameType).toBe('quest_path');
    expect(data.stubSpec.levels).toEqual([]);
    gameId = data.gameId;
  });

  it('spec returns 202 + Retry-After while generating, then the validated GameSpec', async () => {
    const early = await api('GET', `/api/v1/games/${gameId}/spec`);
    if (early.statusCode === 202) {
      expect(early.headers['retry-after']).toBe('2');
    }
    await waitReady(gameId);
    const res = await api('GET', `/api/v1/games/${gameId}/spec`);
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.specVersion).toBe(1);
    expect(spec.levels.length).toBe(5);
    expect(spec.levels[0].isIntro).toBe(true);
    expect(spec.levels[0].items).toEqual([]);
    expect(spec.student.name).toBe('Testy');
    expect(spec.student.color).toBe('#CE82FF'); // personalization injected at assembly
  });

  it('serves assembled HTML with ETag and honors If-None-Match', async () => {
    const res = await api('GET', `/api/v1/games/${gameId}/play`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('window.__EDUMIND_SPEC__');
    expect(res.body).not.toContain('/*__EDUMIND_SPEC_JSON__*/null'); // marker replaced
    const etag = res.headers.etag as string;
    expect(etag).toBeTruthy();
    const cached = await app.inject({
      method: 'GET',
      url: `/api/v1/games/${gameId}/play`,
      headers: { authorization: `Bearer ${token}`, 'if-none-match': etag },
    });
    expect(cached.statusCode).toBe(304);
  });

  it('second identical topic hits the spec cache', async () => {
    const res = await api('POST', '/api/v1/games', {
      topic: 'Photosynthesis', subject: 'Science',
      gameType: 'quest_path', theme: 'sci_fi', sessionLength: 5, difficulty: 'normal',
    });
    const id2 = res.json().gameId;
    await waitReady(id2);
    const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(health.json().metrics.counters.spec_cache_hit).toBeGreaterThanOrEqual(1);
  });

  it('lists the library sorted with metadata', async () => {
    const res = await api('GET', '/api/v1/games/library');
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.total).toBeGreaterThanOrEqual(2);
    expect(data.items[0].topic).toBeTruthy();
    expect(data.items[0].thumbnailUrl).toContain('data:image/svg+xml');
  });
});

describe('sessions, XP, streak, review', () => {
  it('records a play session, awards XP + streak, returns enriched feedback', async () => {
    const summary = {
      xp: 320, accuracy: 0.75, mastery: false, maxCombo: 4, presented: 8,
      items: [
        { id: 'l1_i1', levelIndex: 1, correct: true, hintsUsed: 0, concepts: ['evaporation'], difficulty: 2, prompt: 'q1' },
        { id: 'l1_i2', levelIndex: 1, correct: false, hintsUsed: 1, concepts: ['condensation'], difficulty: 3, prompt: 'q2' },
        { id: 'l2_i1', levelIndex: 2, correct: false, hintsUsed: 2, concepts: ['precipitation'], difficulty: 2, prompt: 'q3' },
        { id: 'l2_i2', levelIndex: 2, correct: true, hintsUsed: 2, concepts: ['collection'], difficulty: 1, prompt: 'q4' },
        { id: 'l2_i3', levelIndex: 2, correct: false, hintsUsed: 0, concepts: ['water cycle'], difficulty: 2, prompt: 'q5' },
        { id: 'l3_i1', levelIndex: 3, correct: false, hintsUsed: 0, concepts: ['hail'], difficulty: 4, prompt: 'q6' },
      ],
      concepts: {},
    };
    const res = await api('POST', `/api/v1/games/${gameId}/sessions`, { summary });
    expect(res.statusCode).toBe(201);
    const data = res.json();
    expect(data.xpAwarded).toBeGreaterThanOrEqual(320);
    expect(data.streak.extendedToday).toBe(true);
    expect(data.streak.count).toBe(1);
    expect(data.enrichedFeedback.headline).toBeTruthy();

    const stats = await api('GET', '/api/v1/students/me/stats');
    expect(stats.json().xp).toBeGreaterThanOrEqual(320);
    expect(stats.json().todaySessions).toBe(1);
  });

  it('game sessions leave game_item evidence in the learning-evidence store', async () => {
    const res = await api('GET', '/api/v1/learn/evidence');
    expect(res.statusCode).toBe(200);
    const rows = res.json().items.filter((r: { source: string }) => r.source === 'game_item');
    expect(rows.length).toBe(6); // one per summary item above
    const first = rows.find((r: { id: string }) => r.id.endsWith('_l1_i1'));
    expect(first.skillId).toBe('game:evaporation');
    expect(first.outcome).toBe('correct');
    expect(first.verification).toBe('client_reported');
    expect(first.toolId).toBe('quest_path'); // falls back to the game row's type
    expect(first.representation).toBe('game');
    const missed = rows.find((r: { id: string }) => r.id.endsWith('_l1_i2'));
    expect(missed.outcome).toBe('incorrect');
    expect(missed.hints).toBe(1);
  });

  it('synthesizes a valid review spec from missed items ($0)', async () => {
    const res = await api('GET', '/api/v1/review/today');
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.meta.gameType).toBe('goal_shootout');
    expect(spec.levels.length).toBe(3);
    expect(spec.levels[0].isIntro).toBe(true);
    // all review items come from previously-missed material
    const ids = spec.levels.flatMap((l: { items: Array<{ id: string }> }) => l.items.map((i) => i.id));
    expect(ids.length).toBeGreaterThanOrEqual(8);
    expect(new Set(ids).size).toBe(ids.length); // unique ids
  });

  it('streak-check reports without lapsing same-day', async () => {
    const res = await api('POST', '/api/v1/students/me/streak-check');
    expect(res.json().playedToday).toBe(true);
    expect(res.json().streakCount).toBe(1);
  });
});

describe('refinement', () => {
  it('theme swap is instant and $0', async () => {
    const res = await api('POST', `/api/v1/games/${gameId}/refine`, { op: 'theme', theme: 'detective' });
    expect(res.statusCode).toBe(200);
    expect(res.json().theme).toBe('detective');
    const spec = await api('GET', `/api/v1/games/${gameId}/spec`);
    expect(spec.json().meta.theme).toBe('detective');
  });

  it('harder shifts the adaptive baseline', async () => {
    const res = await api('POST', `/api/v1/games/${gameId}/refine`, { op: 'harder' });
    expect(res.statusCode).toBe(200);
    const spec = await api('GET', `/api/v1/games/${gameId}/spec`);
    expect(spec.json().meta.difficulty).toBe('hard');
  });

  it('more_questions appends items capped at 6 per level', async () => {
    const before = (await api('GET', `/api/v1/games/${gameId}/spec`)).json();
    const res = await api('POST', `/api/v1/games/${gameId}/refine`, { op: 'more_questions' });
    expect(res.statusCode).toBe(200);
    const after = (await api('GET', `/api/v1/games/${gameId}/spec`)).json();
    for (let i = 1; i < after.levels.length; i++) {
      expect(after.levels[i].items.length).toBeGreaterThanOrEqual(before.levels[i].items.length);
      expect(after.levels[i].items.length).toBeLessThanOrEqual(6);
    }
  });

  it('soft delete removes from the library', async () => {
    const res = await api('DELETE', `/api/v1/games/${gameId}`);
    expect(res.statusCode).toBe(204);
    const lib = await api('GET', '/api/v1/games/library');
    expect(lib.json().items.find((g: { id: string }) => g.id === gameId)).toBeUndefined();
  });
});

describe('arabic game generation (mock)', () => {
  it('generates an Arabic quest with arabic_indic numerals and RTL content', async () => {
    const res = await api('POST', '/api/v1/games', {
      topic: 'دورة الماء', subject: 'العلوم',
      gameType: 'quest_path', theme: 'fantasy', sessionLength: 3, difficulty: 'normal', language: 'ar',
    });
    const id = res.json().gameId;
    await waitReady(id);
    const spec = (await api('GET', `/api/v1/games/${id}/spec`)).json();
    expect(spec.meta.language).toBe('ar');
    expect(spec.meta.numerals).toBe('arabic_indic');
    expect(/[؀-ۿ]/.test(spec.levels[1].teaching[0].text)).toBe(true);
  });
});
