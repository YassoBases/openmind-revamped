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
const { validateInteractivePayload } = await import('../src/tutor/contract.js');

let app: FastifyInstance;
let store: InstanceType<typeof MemoryStore>;
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
  store = new MemoryStore();
  app = await buildApp({ store, provider: new MockProvider() });
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

  describe('interactive blocks (Ask → See → Try)', () => {
    // A middle-school student — the mock only offers blocks to grades 7-9.
    let g7token = '';
    const g7 = async (method: 'GET' | 'POST', url: string, body?: unknown) =>
      app.inject({
        method,
        url,
        payload: body as Record<string, unknown> | undefined,
        headers: { authorization: `Bearer ${g7token}` },
      });

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/students',
        payload: { name: 'سارة', grade: 7, language: 'ar', color: '#8E24AA', dailyGoal: 3 },
      });
      g7token = res.json().token;
    });

    it('math question → validated number_line payload', async () => {
      const res = await g7('POST', '/api/v1/tutor/messages', { question: 'كيف أضع الكسر ٣/٤ على خط الأعداد؟' });
      expect(res.statusCode).toBe(201);
      const p = res.json().reply.interactivePayload;
      expect(p?.type).toBe('number_line');
      expect(p?.version).toBe(1);
      expect(p.data.min).toBeLessThan(p.data.max);
      expect(p.data.target).toBeGreaterThanOrEqual(p.data.min);
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.instructions.length).toBeGreaterThan(0);
    });

    it('science question → order_sequence; language question → sort_buckets', async () => {
      const sci = await g7('POST', '/api/v1/tutor/messages', { question: 'رتب لي مراحل دورة الماء' });
      const seq = sci.json().reply.interactivePayload;
      expect(seq?.type).toBe('order_sequence');
      expect(new Set(seq.data.correctOrder)).toEqual(new Set(seq.data.items.map((i: { id: string }) => i.id)));

      const lang = await g7('POST', '/api/v1/tutor/messages', { question: 'صنف الكلمات: اسم أم فعل أم حرف؟' });
      const sort = lang.json().reply.interactivePayload;
      expect(sort?.type).toBe('sort_buckets');
      const bucketIds = new Set(sort.data.buckets.map((b: { id: string }) => b.id));
      for (const item of sort.data.items) expect(bucketIds.has(item.bucketId)).toBe(true);
    });

    it('vocabulary question → validated match_pairs payload (descriptor-native tool)', async () => {
      const res = await g7('POST', '/api/v1/tutor/messages', { question: 'ساعدني في مفردات الإنجليزية ومعانيها' });
      expect(res.statusCode).toBe(201);
      const p = res.json().reply.interactivePayload;
      expect(p?.type).toBe('match_pairs');
      expect(p?.version).toBe(1);
      expect(p.data.pairs.length).toBeGreaterThanOrEqual(3);
      const lefts = p.data.pairs.map((x: { left: string }) => x.left);
      expect(new Set(lefts).size).toBe(lefts.length);
    });

    it('match_pairs result returns to the same conversation, persists, and gets a result-aware follow-up', async () => {
      const first = await g7('POST', '/api/v1/tutor/messages', { question: 'ما جذر كلمة مدرسة؟' });
      expect(first.json().reply.interactivePayload?.type).toBe('match_pairs');
      const conversationId = first.json().conversationId;
      const res = await g7('POST', '/api/v1/tutor/messages', {
        question: 'وصلت الأزواج كلها من أول محاولة',
        conversationId,
        interactiveResult: {
          blockType: 'match_pairs',
          attempted: true,
          answerOrState: 'طابقت 4 أزواج دون أخطاء',
          correctnessOrOutcome: 'correct',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().reply.responseType).toBe('encouragement');
      expect(res.json().reply.interactivePayload).toBeNull();

      const hist = await g7('GET', `/api/v1/tutor/conversations/${conversationId}`);
      const { messages } = hist.json();
      expect(messages).toHaveLength(4);
      expect(messages[1].interactivePayload?.type).toBe('match_pairs');
      expect(messages[2].interactiveResult?.blockType).toBe('match_pairs');
    });

    it('unsupported concept degrades to guided chat with a null payload', async () => {
      const res = await g7('POST', '/api/v1/tutor/messages', { question: 'لماذا نرى البرق قبل الرعد؟' });
      expect(res.statusCode).toBe(201);
      expect(res.json().reply.interactivePayload).toBeNull();
      expect(res.json().reply.message.length).toBeGreaterThan(0);
    });

    it('interactiveResult returns through the same conversation and gets a result-aware reply', async () => {
      const first = await g7('POST', '/api/v1/tutor/messages', { question: 'رتب لي مراحل دورة الماء' });
      const conversationId = first.json().conversationId;
      const res = await g7('POST', '/api/v1/tutor/messages', {
        question: 'رتبت المراحل: تبخر ثم تكاثف ثم هطول ثم جريان',
        conversationId,
        interactiveResult: {
          blockType: 'order_sequence',
          attempted: true,
          answerOrState: 'رتبت: تبخر → تكاثف → هطول → جريان',
          correctnessOrOutcome: 'correct',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().reply.responseType).toBe('encouragement');
      expect(res.json().reply.interactivePayload).toBeNull();

      // Both the offered payload and the learner result are persisted on the thread.
      const hist = await g7('GET', `/api/v1/tutor/conversations/${conversationId}`);
      const { messages } = hist.json();
      expect(messages).toHaveLength(4);
      expect(messages[1].interactivePayload?.type).toBe('order_sequence');
      expect(messages[2].interactiveResult?.correctnessOrOutcome).toBe('correct');
      expect(messages[3].interactivePayload).toBeNull();
    });

    it('a server-verified block result with skills context becomes a per-skill evidence row', async () => {
      // Offer a balance_scale block (equation trigger), then submit a wrong,
      // structured answer with the step's skill tag as context.
      const first = await g7('POST', '/api/v1/tutor/messages', { question: 'ساعدني في حل معادلة على الميزان' });
      const conversationId = first.json().conversationId;
      expect(first.json().reply.interactivePayload?.type).toBe('balance_scale');

      const res = await g7('POST', '/api/v1/tutor/messages', {
        question: 'حرّكت x',
        conversationId,
        context: { source: 'experience', skills: ['eq.solve_x_plus_b'], pathId: 'missing_number', experienceId: 'equations' },
        interactiveResult: {
          blockType: 'balance_scale',
          attempted: true,
          answerOrState: 'x = 10',
          correctnessOrOutcome: 'correct', // a wrong CLAIM — the server overrides it
          answer: { value: 10 }, // golden target is 10 → x=10 means "set x to the whole side"
        },
      });
      expect(res.statusCode).toBe(201);

      const log = await g7('GET', '/api/v1/learn/evidence');
      const row = log.json().items.find((r: { toolId?: string }) => r.toolId === 'balance_scale');
      expect(row).toMatchObject({
        skillId: 'eq.solve_x_plus_b',
        source: 'tutor_block',
        verification: 'server_verified',
        outcome: 'incorrect', // server recomputed, overriding the "correct" claim
        errorPattern: 'concept_misunderstanding',
      });
    });

    it('rejects a malformed interactiveResult', async () => {
      const res = await g7('POST', '/api/v1/tutor/messages', {
        question: 'انتهيت',
        interactiveResult: { blockType: 'not_a_block', attempted: true, answerOrState: 'x', correctnessOrOutcome: 'correct' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('primary students keep the playful text-only voice', async () => {
      const res = await api('POST', '/api/v1/tutor/messages', { question: 'رتب لي مراحل دورة الماء' });
      expect(res.statusCode).toBe(201);
      expect(res.json().reply.interactivePayload).toBeNull();
    });
  });

  describe('result integrity (server-side verification + learning signal)', () => {
    // Fresh grade 7 student; the store reference lets tests inspect the
    // persisted learning signal directly (it is deliberately not exposed on
    // the conversation API).
    let riToken = '';
    let riStudentId = '';
    const ri = async (body: unknown) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/tutor/messages',
        payload: body as Record<string, unknown>,
        headers: { authorization: `Bearer ${riToken}` },
      });
    /** Opens a fresh conversation holding one order_sequence instance. */
    const openOrderBlock = async () => {
      const res = await ri({ question: 'رتب لي مراحل دورة الماء' });
      expect(res.json().reply.interactivePayload?.type).toBe('order_sequence');
      return res.json().conversationId as string;
    };
    const signalOf = async (conversationId: string) => {
      const messages = await store.listTutorMessages(riStudentId, conversationId, 50);
      const turn = [...messages].reverse().find((m) => m.context?.learningSignal);
      return turn?.context?.learningSignal as Record<string, unknown> | undefined;
    };
    const CORRECT = ['evap', 'cond', 'rain', 'flow'];

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/students',
        payload: { name: 'ليث', grade: 8, language: 'ar', color: '#1CB0F6', dailyGoal: 3 },
      });
      riToken = res.json().token;
      riStudentId = res.json().studentId;
    });

    it('verifies a correct completion server-side and stores the learning signal', async () => {
      const conversationId = await openOrderBlock();
      const res = await ri({
        question: 'رتبت المراحل',
        conversationId,
        interactiveResult: {
          blockType: 'order_sequence',
          attempted: true,
          answerOrState: 'رتبت: تبخر → تكاثف → هطول → جريان',
          correctnessOrOutcome: 'correct',
          answer: { order: CORRECT },
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().reply.responseType).toBe('encouragement');
      const signal = await signalOf(conversationId);
      expect(signal).toMatchObject({
        tool: 'order_sequence',
        toolVersion: 1,
        primitive: 'order',
        completed: true,
        outcome: 'correct',
        verification: 'server_verified',
        attempt: 1,
      });
      expect(signal!.claimedOutcome).toBeUndefined();
    });

    it('verifies an honest incorrect completion (deterministic tools)', async () => {
      const conversationId = await openOrderBlock();
      const res = await ri({
        question: 'رتبت المراحل',
        conversationId,
        interactiveResult: {
          blockType: 'order_sequence',
          attempted: true,
          answerOrState: 'رتبت ترتيبًا معكوسًا',
          correctnessOrOutcome: 'incorrect',
          answer: { order: ['flow', 'evap', 'cond', 'rain'] }, // 0 positions right
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().reply.responseType).toBe('correction');
      expect(res.json().reply.suggestedAction).toBe('try_again');
      expect(await signalOf(conversationId)).toMatchObject({
        outcome: 'incorrect',
        verification: 'server_verified',
      });
    });

    it('overrides a tampered correctness claim with the server-computed outcome', async () => {
      const conversationId = await openOrderBlock();
      const res = await ri({
        question: 'رتبت كل شيء صحيحًا!',
        conversationId,
        interactiveResult: {
          blockType: 'order_sequence',
          attempted: true,
          answerOrState: 'رتبت المراحل كلها',
          correctnessOrOutcome: 'correct', // the claim
          answer: { order: ['cond', 'evap', 'rain', 'flow'] }, // actually 2/4
        },
      });
      expect(res.statusCode).toBe(201);
      // No false celebration: the tutor reacts to the VERIFIED outcome.
      expect(res.json().reply.responseType).not.toBe('encouragement');
      const messages = await store.listTutorMessages(riStudentId, conversationId, 50);
      const resultTurn = messages.find((m) => m.context?.interactiveResult);
      expect(
        (resultTurn!.context!.interactiveResult as Record<string, unknown>).correctnessOrOutcome,
      ).toBe('partially_correct');
      expect(await signalOf(conversationId)).toMatchObject({
        outcome: 'partially_correct',
        claimedOutcome: 'correct',
        verification: 'server_verified',
      });
    });

    it('rejects an answer that does not fit the instance — safely', async () => {
      const conversationId = await openOrderBlock();
      const res = await ri({
        question: 'انتهيت من النشاط',
        conversationId,
        interactiveResult: {
          blockType: 'order_sequence',
          attempted: true,
          answerOrState: 'رتبت',
          correctnessOrOutcome: 'correct',
          answer: { order: ['hack1', 'hack2', 'hack3', 'hack4'] }, // foreign ids
        },
      });
      // The conversation is not broken and there is no false success.
      expect(res.statusCode).toBe(201);
      expect(res.json().reply.responseType).not.toBe('encouragement');
      expect(res.json().reply.message.length).toBeGreaterThan(0);
      const hist = await app.inject({
        method: 'GET',
        url: `/api/v1/tutor/conversations/${conversationId}`,
        headers: { authorization: `Bearer ${riToken}` },
      });
      const last = hist.json().messages.at(-2); // the student turn
      expect(last.role).toBe('student');
      expect(last.interactiveResult).toBeNull(); // never stored as an answer
      expect(await signalOf(conversationId)).toMatchObject({
        verification: 'rejected',
        rejectReason: 'invalid_answer',
        outcome: null,
      });
    });

    it('rejects a result no block was ever offered for', async () => {
      const res = await ri({
        question: 'انتهيت!',
        interactiveResult: {
          blockType: 'match_pairs',
          attempted: true,
          answerOrState: 'طابقت كل شيء',
          correctnessOrOutcome: 'correct',
          answer: { wrongTries: 0 },
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().reply.responseType).not.toBe('encouragement');
      expect(await signalOf(res.json().conversationId)).toMatchObject({
        verification: 'rejected',
        rejectReason: 'no_open_block',
      });
    });

    it('blocks a duplicate submission for an already-answered instance', async () => {
      const conversationId = await openOrderBlock();
      const submit = () =>
        ri({
          question: 'رتبت المراحل',
          conversationId,
          interactiveResult: {
            blockType: 'order_sequence',
            attempted: true,
            answerOrState: 'رتبت الترتيب الصحيح',
            correctnessOrOutcome: 'correct',
            answer: { order: CORRECT },
          },
        });
      const first = await submit();
      expect(first.json().reply.responseType).toBe('encouragement');
      const second = await submit();
      expect(second.statusCode).toBe(201);
      expect(second.json().reply.responseType).not.toBe('encouragement');

      // Exactly ONE result turn exists; restoration sees one answered block.
      const hist = await app.inject({
        method: 'GET',
        url: `/api/v1/tutor/conversations/${conversationId}`,
        headers: { authorization: `Bearer ${riToken}` },
      });
      const resultTurns = hist.json().messages.filter(
        (m: { interactiveResult: unknown }) => m.interactiveResult != null,
      );
      expect(resultTurns).toHaveLength(1);
      expect(await signalOf(conversationId)).toMatchObject({
        verification: 'rejected',
        rejectReason: 'duplicate',
      });
    });

    it('keeps restoration intact: payload and verified result ride the thread', async () => {
      const conversationId = await openOrderBlock();
      await ri({
        question: 'رتبت المراحل',
        conversationId,
        interactiveResult: {
          blockType: 'order_sequence',
          attempted: true,
          answerOrState: 'رتبت الترتيب الصحيح',
          correctnessOrOutcome: 'correct',
          answer: { order: CORRECT },
        },
      });
      const hist = await app.inject({
        method: 'GET',
        url: `/api/v1/tutor/conversations/${conversationId}`,
        headers: { authorization: `Bearer ${riToken}` },
      });
      const { messages } = hist.json();
      expect(messages).toHaveLength(4);
      expect(messages[1].interactivePayload?.type).toBe('order_sequence');
      expect(messages[2].interactiveResult?.correctnessOrOutcome).toBe('correct');
    });
  });

  describe('validateInteractivePayload (semantic gate)', () => {
    const base = {
      version: 1,
      title: 'ت',
      instructions: 'ت',
      expectedLearningAction: '',
      followUpPrompt: '',
    };
    const data = {
      min: null, max: null, step: null, target: null, tolerance: null, unit: null,
      items: null, correctOrder: null, buckets: null,
    };

    it('drops a number line whose target sits outside the range', () => {
      expect(validateInteractivePayload({
        ...base, type: 'number_line',
        data: { ...data, min: 0, max: 1, step: 0.1, target: 5, tolerance: 0.1 },
      })).toBeNull();
    });

    it('drops an order whose correctOrder is not a permutation of the items', () => {
      expect(validateInteractivePayload({
        ...base, type: 'order_sequence',
        data: {
          ...data,
          items: [
            { id: 'a', label: 'أ', bucketId: null },
            { id: 'b', label: 'ب', bucketId: null },
            { id: 'c', label: 'ج', bucketId: null },
          ],
          correctOrder: ['a', 'b', 'zzz'],
        },
      })).toBeNull();
    });

    it('drops sorting items that point at a missing bucket', () => {
      expect(validateInteractivePayload({
        ...base, type: 'sort_buckets',
        data: {
          ...data,
          buckets: [{ id: 'x', label: 'س' }, { id: 'y', label: 'ص' }],
          items: [
            { id: '1', label: 'أ', bucketId: 'x' },
            { id: '2', label: 'ب', bucketId: 'nope' },
            { id: '3', label: 'ج', bucketId: 'y' },
          ],
        },
      })).toBeNull();
    });

    it('drops any payload from a different registry version', () => {
      expect(validateInteractivePayload({
        ...base, version: 2, type: 'number_line',
        data: { ...data, min: 0, max: 1, step: 0.1, target: 0.5, tolerance: 0.1 },
      })).toBeNull();
    });
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
