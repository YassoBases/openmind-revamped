/**
 * QwenTutorProvider tests — every network call is a mocked fetch, never a
 * real API. Covers: the happy path, schema rejection, malformed JSON, HTTP
 * errors, timeouts (all falling back safely), key hygiene, and the full
 * route integration where the route's own gates keep applying on top of
 * whatever Qwen returns.
 */
import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

process.env.MOCK_LLM = 'true';
process.env.MOCK_LATENCY_MS = '10';
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'production';

const { buildApp } = await import('../src/app.js');
const { MockProvider } = await import('../src/llm/mock.js');
const { QwenTutorProvider } = await import('../src/llm/qwen.js');
const { MemoryStore } = await import('../src/store/memory.js');
import type { TutorReplyParams } from '../src/pipeline/provider.js';
import type { TutorReply } from '../src/tutor/contract.js';

const API_KEY = 'sk-test-qwen-secret-000';

const PARAMS: TutorReplyParams = {
  student: {
    name: 'سارة',
    grade: 7,
    stage: 'middle_interactive_learning',
    language: 'ar',
    interest: null,
    learningContext: 'market',
  },
  question: 'كيف أحل معادلة من خطوة واحدة؟',
  context: null,
  availableTools: [],
  interactiveResult: null,
  history: [],
};

const VALID_REPLY: TutorReply = {
  message: 'لنبدأ بخطوة صغيرة: ما العملية التي تعزل x وحده؟',
  responseType: 'question',
  followUpQuestion: 'ما أول خطوة تخطر ببالك؟',
  suggestedAction: 'ask_followup',
  relatedConcept: 'المعادلات',
  needsClarification: false,
  interactivePayload: null,
  suggestedInteraction: null,
};

function okResponse(content: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: typeof content === 'string' ? content : JSON.stringify(content),
          },
        },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function makeProvider(fetchImpl: typeof fetch, overrides: Partial<{ timeoutMs: number }> = {}) {
  const fallback = {
    name: 'fallback-mock',
    tutorReply: vi.fn(async () => ({
      data: { ...VALID_REPLY, message: 'fallback reply' },
      model: 'fallback',
    })),
  };
  const provider = new QwenTutorProvider({
    apiKey: API_KEY,
    baseUrl: 'https://qwen.test/v1',
    model: 'qwen-test',
    timeoutMs: overrides.timeoutMs ?? 5000,
    fallback,
    fetchImpl,
  });
  return { provider, fallback };
}

describe('QwenTutorProvider', () => {
  it('returns a schema-valid Qwen reply and never calls the fallback', async () => {
    const fetchMock = vi.fn(async () => okResponse(VALID_REPLY));
    const { provider, fallback } = makeProvider(fetchMock as unknown as typeof fetch);

    const res = await provider.tutorReply(PARAMS);
    expect(res.model).toBe('qwen-test');
    expect(res.data.message).toContain('خطوة');
    expect(fallback.tutorReply).not.toHaveBeenCalled();

    // The request carries the key ONLY in the Authorization header and asks
    // for JSON output.
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('https://qwen.test/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${API_KEY}`);
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('qwen-test');
    expect(body.response_format).toEqual({ type: 'json_object' });
    // Identity rides the user message from the authenticated row.
    expect(body.messages[1].content).toContain('"grade":7');
  });

  it('normalizes omitted flat keys (json_object mode has no constrained decoding)', async () => {
    // Qwen's natural output: only the keys the tool actually uses, and no
    // top-level nulls it considers redundant. Must NOT fall back.
    const sparse = {
      message: 'جرّب وضع الكسر على الخط',
      responseType: 'next_step',
      suggestedAction: 'try_again',
      needsClarification: false,
      interactivePayload: {
        type: 'number_line',
        version: 1,
        title: 'ضع الكسر',
        instructions: 'حرّك المؤشر إلى ٣/٤',
        expectedLearningAction: 'وضع القيمة بنفسه',
        followUpPrompt: 'ماذا لاحظت؟',
        data: { min: 0, max: 1, step: 0.25, target: 0.75, tolerance: 0.05 },
      },
    };
    const { provider, fallback } = makeProvider(
      vi.fn(async () => okResponse(sparse)) as unknown as typeof fetch,
    );
    const res = await provider.tutorReply(PARAMS);
    expect(res.model).toBe('qwen-test');
    expect(fallback.tutorReply).not.toHaveBeenCalled();
    expect(res.data.followUpQuestion).toBeNull();
    expect(res.data.relatedConcept).toBeNull();
    expect(res.data.suggestedInteraction).toBeNull();
    // Omitted data keys filled with null; provided keys untouched.
    expect(res.data.interactivePayload?.data.items).toBeNull();
    expect(res.data.interactivePayload?.data.target).toBe(0.75);
  });

  it('normalizes omitted NESTED item keys (order items have no bucketId)', async () => {
    const sparse = {
      message: 'رتب المراحل',
      responseType: 'next_step',
      suggestedAction: 'try_again',
      needsClarification: false,
      interactivePayload: {
        type: 'order_sequence', version: 1, title: 'رتب', instructions: 'رتب المراحل',
        expectedLearningAction: 'يرتب بنفسه', followUpPrompt: 'ماذا لاحظت؟',
        data: {
          items: [
            { id: 'a', label: 'تبخر' },
            { id: 'b', label: 'تكاثف' },
            { id: 'c', label: 'هطول' },
          ],
          correctOrder: ['a', 'b', 'c'],
        },
      },
    };
    const { provider, fallback } = makeProvider(
      vi.fn(async () => okResponse(sparse)) as unknown as typeof fetch,
    );
    const res = await provider.tutorReply(PARAMS);
    expect(res.model).toBe('qwen-test');
    expect(fallback.tutorReply).not.toHaveBeenCalled();
    const items = res.data.interactivePayload?.data.items as Array<{ bucketId: string | null }>;
    expect(items[0]!.bucketId).toBeNull();
  });

  it('a malformed payload with a healthy envelope keeps the model text, drops the activity', async () => {
    // items without ids are unrecoverable (correctOrder references ids) —
    // the honest degradation is Qwen's own message with NO broken block,
    // never a canned fallback reply mid-conversation.
    const wrongTyped = {
      ...VALID_REPLY,
      interactivePayload: {
        type: 'number_line', version: 1, title: 'ت', instructions: 'ت',
        expectedLearningAction: 'ت', followUpPrompt: 'ت',
        data: { min: 'zero', max: 1, step: 0.25, target: 0.75, tolerance: 0.05 },
      },
    };
    const { provider, fallback } = makeProvider(
      vi.fn(async () => okResponse(wrongTyped)) as unknown as typeof fetch,
    );
    const res = await provider.tutorReply(PARAMS);
    expect(res.model).toBe('qwen-test'); // Qwen still answers
    expect(res.data.message).toBe(VALID_REPLY.message); // its own text
    expect(res.data.interactivePayload).toBeNull(); // broken activity dropped
    expect(fallback.tutorReply).not.toHaveBeenCalled();
  });

  it('a broken ENVELOPE still falls back completely', async () => {
    const broken = { ...VALID_REPLY, responseType: 'not_a_type' };
    const { provider, fallback } = makeProvider(
      vi.fn(async () => okResponse(broken)) as unknown as typeof fetch,
    );
    const res = await provider.tutorReply(PARAMS);
    expect(res.model).toBe('fallback');
    expect(fallback.tutorReply).toHaveBeenCalledOnce();
  });

  it('sends the configured max_tokens (reasoning models need headroom)', async () => {
    const fetchMock = vi.fn(async () => okResponse(VALID_REPLY));
    const fallback = {
      name: 'fb',
      tutorReply: vi.fn(async () => ({ data: VALID_REPLY, model: 'fallback' })),
    };
    const provider = new QwenTutorProvider({
      apiKey: API_KEY,
      baseUrl: 'https://qwen.test/v1',
      model: 'qwen-test',
      timeoutMs: 5000,
      maxTokens: 8192,
      fallback,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await provider.tutorReply(PARAMS);
    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).max_tokens).toBe(8192);
  });

  it('forwards context.mode to Qwen — study programs ride the same seam', async () => {
    const fetchMock = vi.fn(async () => okResponse(VALID_REPLY));
    const { provider } = makeProvider(fetchMock as unknown as typeof fetch);
    await provider.tutorReply({
      ...PARAMS,
      context: { source: 'ask', mode: 'exam_prep' },
    });
    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages[1].content).toContain('"mode":"exam_prep"');
    // The static system prompt carries the program rules for that id.
    expect(body.messages[0].content).toContain('"exam_prep"');
  });

  it('accepts a reply wrapped in markdown fences (defensive parse)', async () => {
    const fenced = '```json\n' + JSON.stringify(VALID_REPLY) + '\n```';
    const { provider, fallback } = makeProvider(
      vi.fn(async () => okResponse(fenced)) as unknown as typeof fetch,
    );
    const res = await provider.tutorReply(PARAMS);
    expect(res.model).toBe('qwen-test');
    expect(fallback.tutorReply).not.toHaveBeenCalled();
  });

  it('falls back when the reply fails Zod validation', async () => {
    const invalid = { ...VALID_REPLY, responseType: 'not_a_type' };
    const { provider, fallback } = makeProvider(
      vi.fn(async () => okResponse(invalid)) as unknown as typeof fetch,
    );
    const res = await provider.tutorReply(PARAMS);
    expect(res.model).toBe('fallback');
    expect(fallback.tutorReply).toHaveBeenCalledOnce();
  });

  it('falls back on non-JSON model output', async () => {
    const { provider, fallback } = makeProvider(
      vi.fn(async () => okResponse('sure! here is my answer…')) as unknown as typeof fetch,
    );
    const res = await provider.tutorReply(PARAMS);
    expect(res.model).toBe('fallback');
    expect(fallback.tutorReply).toHaveBeenCalledOnce();
  });

  it('falls back on an HTTP error without leaking the response body', async () => {
    const logs: unknown[] = [];
    const fetchMock = vi.fn(
      async () => new Response(`bad key ${API_KEY}`, { status: 401 }),
    );
    const fallback = {
      name: 'fb',
      tutorReply: vi.fn(async () => ({ data: VALID_REPLY, model: 'fallback' })),
    };
    const provider = new QwenTutorProvider({
      apiKey: API_KEY,
      baseUrl: 'https://qwen.test/v1',
      model: 'qwen-test',
      timeoutMs: 5000,
      fallback,
      fetchImpl: fetchMock as unknown as typeof fetch,
      logger: { warn: (obj) => logs.push(obj) },
    });
    const res = await provider.tutorReply(PARAMS);
    expect(res.model).toBe('fallback');
    // Key hygiene: nothing logged may contain the secret.
    expect(JSON.stringify(logs)).not.toContain(API_KEY);
    expect(JSON.stringify(logs)).toContain('qwen http 401');
  });

  it('times out a hung request and falls back', async () => {
    const hung = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    const { provider, fallback } = makeProvider(hung as unknown as typeof fetch, {
      timeoutMs: 30,
    });
    const res = await provider.tutorReply(PARAMS);
    expect(res.model).toBe('fallback');
    expect(fallback.tutorReply).toHaveBeenCalledOnce();
  });
});

describe('route integration (tutorProvider seam)', () => {
  async function appWithQwen(fetchImpl: typeof fetch): Promise<{ app: FastifyInstance; token: string }> {
    const mock = new MockProvider();
    const app = await buildApp({
      store: new MemoryStore(),
      provider: mock,
      tutorProvider: new QwenTutorProvider({
        apiKey: API_KEY,
        baseUrl: 'https://qwen.test/v1',
        model: 'qwen-test',
        timeoutMs: 5000,
        fallback: mock,
        fetchImpl,
      }),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/students',
      payload: { name: 'سارة', grade: 7, language: 'ar', color: '#8E24AA', dailyGoal: 3 },
    });
    return { app, token: res.json().token };
  }

  it('routes Ask Hudhud through Qwen while content generation stays on the regular provider', async () => {
    const { app, token } = await appWithQwen(
      vi.fn(async () => okResponse(VALID_REPLY)) as unknown as typeof fetch,
    );
    const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(health.json().llm).toBe('mock');
    expect(health.json().tutorLlm).toBe('qwen');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tutor/messages',
      payload: { question: 'كيف أحل معادلة؟' },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().model).toBe('qwen-test');
  });

  it("the route's gates still drop an unrenderable Qwen payload (spec-not-code holds)", async () => {
    const withBadBlock = {
      ...VALID_REPLY,
      interactivePayload: {
        type: 'number_line',
        version: 1,
        title: 'جرّب',
        instructions: 'ضع القيمة',
        // Structurally complete (every flat key present) so it passes the
        // schema — but the target sits far outside [min,max], so the ROUTE's
        // semantic gate must drop it.
        data: {
          min: 0, max: 1, step: 0.1, target: 99, tolerance: 0.1, unit: null,
          items: null, correctOrder: null, buckets: null, pairs: null,
          coefficient: null, constant: null, views: null,
        },
        expectedLearningAction: 'وضع القيمة',
        followUpPrompt: 'ماذا لاحظت؟',
      },
    };
    const { app, token } = await appWithQwen(
      vi.fn(async () => okResponse(withBadBlock)) as unknown as typeof fetch,
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tutor/messages',
      payload: { question: 'ضع الكسر على خط الأعداد' },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().model).toBe('qwen-test');
    expect(res.json().reply.interactivePayload).toBeNull(); // dropped, text stands
  });

  it('a Qwen outage degrades to the regular provider, not a broken tutor', async () => {
    const { app, token } = await appWithQwen(
      vi.fn(async () => new Response('oops', { status: 503 })) as unknown as typeof fetch,
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tutor/messages',
      payload: { question: 'كيف أحسب مساحة المثلث؟' },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().model).toBe('mock'); // the fallback answered
    expect(res.json().reply.message.length).toBeGreaterThan(0);
  });
});
