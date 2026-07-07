/**
 * POST /api/v1/tools/:toolId/verify — the stateless verification route lesson
 * experiences use (see routes/tools.ts). Same fastify.inject() harness as
 * tutor.test.ts.
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

beforeAll(async () => {
  const store = new MemoryStore();
  app = await buildApp({ store, provider: new MockProvider() });
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/students',
    payload: { name: 'يوسف', grade: 7, language: 'ar', color: '#1CB0F6', interest: 'space', dailyGoal: 3 },
  });
  token = res.json().token;
});

const balanceData = { coefficient: 1, constant: 3, target: 10, min: 0, max: 20, step: 1, tolerance: 0 };

describe('POST /api/v1/tools/:toolId/verify', () => {
  it('rejects unauthenticated calls', async () => {
    const res = await api('POST', '/api/v1/tools/balance_scale/verify', { data: balanceData, answer: { value: 7 } }, false);
    expect(res.statusCode).toBe(401);
  });

  it('404s an unknown tool id', async () => {
    const res = await api('POST', '/api/v1/tools/not_a_tool/verify', { data: {}, answer: {} });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('400s data that fails the tool’s own semantic gate', async () => {
    const res = await api('POST', '/api/v1/tools/balance_scale/verify', {
      data: { ...balanceData, coefficient: 0 }, // zero coefficient — not a real unknown
      answer: { value: 7 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_DATA');
  });

  it('400s a malformed body', async () => {
    const res = await api('POST', '/api/v1/tools/balance_scale/verify', { data: balanceData });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('recomputes the correct verdict from data + answer — the same descriptor tutor/messages uses', async () => {
    const correct = await api('POST', '/api/v1/tools/balance_scale/verify', { data: balanceData, answer: { value: 7 } });
    expect(correct.statusCode).toBe(200);
    expect(correct.json().verdict).toBe('correct');

    const wrong = await api('POST', '/api/v1/tools/balance_scale/verify', { data: balanceData, answer: { value: 2 } });
    expect(wrong.json().verdict).toBe('incorrect');

    const noAnswer = await api('POST', '/api/v1/tools/balance_scale/verify', { data: balanceData, answer: {} });
    expect(noAnswer.json().verdict).toBe('unverifiable');
  });

  it('diagnoses a wrong answer as a specific error pattern (procedural vs concept)', async () => {
    // 3x + 2 = 17 → x = 5. Setting x to the whole other side (17) means the
    // learner does not see the equation as two sides at all.
    const twoStep = { coefficient: 3, constant: 2, target: 17, min: 0, max: 20, step: 1, tolerance: 0 };
    const concept = await api('POST', '/api/v1/tools/balance_scale/verify', { data: twoStep, answer: { value: 17 } });
    expect(concept.json()).toMatchObject({ verdict: 'incorrect', errorPattern: 'concept_misunderstanding' });

    // Undid the +2 but forgot to divide by 3 (x = 17 - 2 = 15): right idea,
    // missed a procedure step.
    const procedural = await api('POST', '/api/v1/tools/balance_scale/verify', { data: twoStep, answer: { value: 15 } });
    expect(procedural.json()).toMatchObject({ verdict: 'incorrect', errorPattern: 'procedural_error' });

    // A correct answer carries no error pattern.
    const correct = await api('POST', '/api/v1/tools/balance_scale/verify', { data: twoStep, answer: { value: 5 } });
    expect(correct.json()).toMatchObject({ verdict: 'correct', errorPattern: null });
  });

  it('records a server_verified evidence row when the optional evidence context is present', async () => {
    const eventId = 'verify-evt-0000000001';
    const res = await api('POST', '/api/v1/tools/balance_scale/verify', {
      data: balanceData,
      answer: { value: 2 }, // wrong on x+3=10
      evidence: {
        eventId,
        skillId: 'eq.solve_x_plus_b',
        representation: 'manipulative',
        kind: 'construction',
        pathId: 'missing_number',
        experienceId: 'equations',
        stepIndex: 3,
      },
    });
    expect(res.statusCode).toBe(200);

    const log = await api('GET', '/api/v1/learn/evidence');
    const row = log.json().items.find((r: { id: string }) => r.id === eventId);
    expect(row).toMatchObject({
      id: eventId,
      skillId: 'eq.solve_x_plus_b',
      source: 'tool_verify',
      verification: 'server_verified', // the SERVER set outcome/verification
      outcome: 'incorrect',
      toolId: 'balance_scale',
    });
  });

  it('does not record evidence when the context is absent (today’s behavior preserved)', async () => {
    const before = (await api('GET', '/api/v1/learn/evidence')).json().total;
    await api('POST', '/api/v1/tools/balance_scale/verify', { data: balanceData, answer: { value: 7 } });
    const after = (await api('GET', '/api/v1/learn/evidence')).json().total;
    expect(after).toBe(before);
  });
});
