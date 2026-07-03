/**
 * Tutor flow integration tests: MOCK_LLM mode against the in-memory store via
 * fastify.inject() — same harness as api.test.ts. Covers auth, validation,
 * the structured reply contract, conversation persistence, and continuity.
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

let app: FastifyInstance;
let token = '';

async function api(method: 'GET' | 'POST', url: string, body?: unknown) {
  return app.inject({
    method,
    url,
    payload: body as Record<string, unknown> | undefined,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeAll(async () => {
  app = await buildApp({ store: new MemoryStore(), provider: new MockProvider() });
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/students',
    payload: { name: 'سلمى', grade: 6, language: 'ar', color: '#1CB0F6', interest: 'space', dailyGoal: 3 },
  });
  token = res.json().token;
});

describe('tutor', () => {
  it('rejects unauthenticated questions', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tutor/messages',
      payload: { question: 'ما مساحة المثلث؟' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an invalid body with the error envelope', async () => {
    const res = await api('POST', '/api/v1/tutor/messages', { question: '' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  let conversationId = '';

  it('answers a general question with the structured contract', async () => {
    const res = await api('POST', '/api/v1/tutor/messages', {
      question: 'كيف أحسب مساحة المثلث؟',
    });
    expect(res.statusCode).toBe(201);
    const data = res.json();
    conversationId = data.conversationId;
    expect(conversationId).toBeTruthy();
    expect(data.model).toBe('mock');
    expect(data.reply.message.length).toBeGreaterThan(0);
    expect([
      'explanation', 'hint', 'question', 'encouragement', 'correction', 'next_step',
    ]).toContain(data.reply.responseType);
    expect([
      'none', 'try_again', 'show_hint', 'real_life_example', 'open_related_experience', 'ask_followup',
    ]).toContain(data.reply.suggestedAction);
    expect(typeof data.reply.needsClarification).toBe('boolean');
  });

  it('gives contextual in-experience help (hint, not the answer)', async () => {
    const res = await api('POST', '/api/v1/tutor/messages', {
      question: 'أنا عالق في هذه الخطوة',
      context: {
        source: 'experience',
        subject: 'الرياضيات',
        pathId: 'neighborhood_engineer',
        experienceId: 'triangle_garden',
        experienceTitle: 'الركن الأخضر في الساحة',
        concept: 'مساحة المثلث',
        stepKind: 'challenge',
        stepTitle: 'تربة تكفي 24 مترًا مربعًا',
        state: 'القاعدة=4، الارتفاع=4، المساحة=8 — الهدف 24',
        attempts: ['القاعدة=5، الارتفاع=5'],
      },
    });
    expect(res.statusCode).toBe(201);
    const data = res.json();
    expect(data.reply.responseType).toBe('hint');
    expect(data.reply.suggestedAction).toBe('try_again');
    expect(data.reply.relatedConcept).toBe('مساحة المثلث');
  });

  it('continues a conversation and persists both roles in history', async () => {
    const res = await api('POST', '/api/v1/tutor/messages', {
      question: 'وماذا عن المستطيل؟',
      conversationId,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().conversationId).toBe(conversationId);

    const hist = await api('GET', `/api/v1/tutor/conversations/${conversationId}`);
    expect(hist.statusCode).toBe(200);
    const { messages } = hist.json();
    // two exchanges in this conversation = 4 turns, oldest first
    expect(messages.length).toBe(4);
    expect(messages[0].role).toBe('student');
    expect(messages[1].role).toBe('tutor');
    expect(messages[1].responseType).toBeTruthy();
    expect(messages[2].content).toBe('وماذا عن المستطيل؟');
  });

  it('keeps conversations private to their student', async () => {
    const other = await app.inject({
      method: 'POST',
      url: '/api/v1/students',
      payload: { name: 'Sami', grade: 5, language: 'en', color: '#58CC02', dailyGoal: 3 },
    });
    const otherToken = other.json().token;
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tutor/conversations/${conversationId}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().messages).toHaveLength(0);
  });
});
