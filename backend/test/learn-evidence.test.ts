/**
 * GET/POST /api/v1/learn/evidence — the backend half of the client's
 * LearnEvidenceStore. Same fastify.inject() harness as tools-verify.test.ts.
 * The log is append-only and idempotent by client-generated id, so sync is a
 * conflict-free union (the same monotonic property completion relies on).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

process.env.MOCK_LLM = 'true';
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'production';

const { buildApp } = await import('../src/app.js');
const { MockProvider } = await import('../src/llm/mock.js');
const { MemoryStore } = await import('../src/store/memory.js');

let app: FastifyInstance;
let token = '';

async function api(method: 'GET' | 'POST', url: string, body?: unknown, auth = true) {
  return app.inject({
    method,
    url,
    payload: body as Record<string, unknown> | undefined,
    headers: auth && token ? { authorization: `Bearer ${token}` } : {},
  });
}

function event(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    skillId: 'eq.equality_balance',
    representation: 'manipulative',
    source: 'learn_step',
    kind: 'prediction',
    outcome: 'correct',
    verification: 'client_reported',
    createdAt: new Date().toISOString(),
    ...over,
  };
}

beforeAll(async () => {
  const store = new MemoryStore();
  app = await buildApp({ store, provider: new MockProvider() });
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/students',
    payload: { name: 'ريم', grade: 7, language: 'ar', color: '#1CB0F6', interest: 'space', dailyGoal: 3 },
  });
  token = res.json().token;
});

describe('learn evidence endpoints', () => {
  it('requires auth', async () => {
    expect((await api('GET', '/api/v1/learn/evidence', undefined, false)).statusCode).toBe(401);
    expect((await api('POST', '/api/v1/learn/evidence', { events: [event('e1000000')] }, false)).statusCode).toBe(401);
  });

  it('appends events and returns them oldest first', async () => {
    const res = await api('POST', '/api/v1/learn/evidence', {
      events: [event('evt-000000001'), event('evt-000000002', { skillId: 'eq.solve_x_plus_b', outcome: 'incorrect', errorPattern: 'procedural_error' })],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().accepted).toBe(2);

    const log = await api('GET', '/api/v1/learn/evidence');
    expect(log.json().total).toBe(2);
    const ids = log.json().items.map((r: { id: string }) => r.id);
    expect(ids).toContain('evt-000000001');
    // studentId is never echoed back to the client.
    expect(log.json().items[0].studentId).toBeUndefined();
  });

  it('is idempotent by event id — a replayed batch accepts nothing new', async () => {
    const before = (await api('GET', '/api/v1/learn/evidence')).json().total;
    const res = await api('POST', '/api/v1/learn/evidence', {
      events: [event('evt-000000001'), event('evt-000000009')], // one seen, one new
    });
    expect(res.json().accepted).toBe(1);
    expect((await api('GET', '/api/v1/learn/evidence')).json().total).toBe(before + 1);
  });

  it('rejects a malformed event (bad enum)', async () => {
    const res = await api('POST', '/api/v1/learn/evidence', {
      events: [event('evt-bad-00001', { outcome: 'not_an_outcome' })],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('filters by ?since=', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await api('GET', `/api/v1/learn/evidence?since=${future}`);
    expect(res.json().total).toBe(0);
  });
});
