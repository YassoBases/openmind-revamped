/**
 * Study-mode tests — the five programs behind Ask Hudhud's mode picker.
 * Program logic keys on STABLE ids riding TutorContext.mode (never Arabic
 * button text); the mock provider mirrors the live prompt's per-mode FIRST
 * STEP so each program's opening behavior is asserted deterministically.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

process.env.MOCK_LLM = 'true';
process.env.MOCK_LATENCY_MS = '10';
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'production';

const { buildApp } = await import('../src/app.js');
const { MockProvider } = await import('../src/llm/mock.js');
const { MemoryStore } = await import('../src/store/memory.js');
const { STUDY_MODES } = await import('../src/tutor/contract.js');

let app: FastifyInstance;
let token = '';

const ask = (body: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/tutor/messages',
    payload: body,
    headers: { authorization: `Bearer ${token}` },
  });

beforeAll(async () => {
  app = await buildApp({ store: new MemoryStore(), provider: new MockProvider() });
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/students',
    payload: { name: 'سارة', grade: 7, language: 'ar', color: '#8E24AA', dailyGoal: 3 },
  });
  token = res.json().token;
});

describe('study modes (context.mode)', () => {
  it('the prompt carries the program-discipline rules (adherence guardrails)', async () => {
    const { TUTOR_SYSTEM_PROMPT } = await import('../src/llm/prompts.js');
    expect(TUTOR_SYSTEM_PROMPT).toContain('PROGRAM DISCIPLINE');
    expect(TUTOR_SYSTEM_PROMPT).toContain('ONE compact question');
    expect(TUTOR_SYSTEM_PROMPT).toContain('NEVER invent, assume, or substitute');
    expect(TUTOR_SYSTEM_PROMPT).toContain('ONE question per turn TOTAL');
    expect(TUTOR_SYSTEM_PROMPT).toContain('EXACTLY as spelled');
  });

  it('the contract reserves exactly the five stable program ids', () => {
    expect([...STUDY_MODES]).toEqual([
      'exam_prep',
      'lesson_discovery',
      'backlog_plan',
      'solve_diagnose',
      'quick_review',
    ]);
  });

  it('rejects an unknown mode id (Arabic labels are not wire values)', async () => {
    const res = await ask({
      question: 'حضّرني لسبر',
      context: { source: 'ask', mode: 'حضّرني لسبر' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('a message without a mode keeps normal tutoring', async () => {
    const res = await ask({ question: 'كيف أحسب مساحة المثلث؟', context: { source: 'ask' } });
    expect(res.statusCode).toBe(201);
    // The generic hint-first opener, not a program's input-collection step.
    expect(res.json().reply.needsClarification).toBe(false);
  });

  it('exam_prep opens by collecting subject, topics, exam date, and available time', async () => {
    const res = await ask({
      question: 'حضّرني لسبر',
      context: { source: 'ask', mode: 'exam_prep' },
    });
    expect(res.statusCode).toBe(201);
    const reply = res.json().reply;
    expect(reply.responseType).toBe('question');
    expect(reply.needsClarification).toBe(true); // inputs still missing
    expect(reply.message).toContain('المادة');
    expect(reply.message).toContain('الموضوعات');
    expect(reply.message).toContain('موعده');
    expect(reply.message).toContain('الوقت');
    expect(reply.interactivePayload).toBeNull();
  });

  it('lesson_discovery opens by asking for the lesson and the student interest', async () => {
    const res = await ask({
      question: 'خلّيني أفهم درس',
      context: { source: 'ask', mode: 'lesson_discovery' },
    });
    const reply = res.json().reply;
    expect(reply.responseType).toBe('question');
    expect(reply.needsClarification).toBe(true);
    expect(reply.message).toContain('درس');
    expect(reply.message).toContain('تستمتع');
  });

  it('backlog_plan opens by collecting the backlog, deadlines, and daily time', async () => {
    const res = await ask({
      question: 'عندي تراكم',
      context: { source: 'ask', mode: 'backlog_plan' },
    });
    const reply = res.json().reply;
    expect(reply.responseType).toBe('question');
    expect(reply.needsClarification).toBe(true);
    expect(reply.message).toContain('تراكم');
    expect(reply.message).toContain('مواعيد');
    expect(reply.message).toContain('يوميًا');
  });

  it("solve_diagnose opens by insisting on the problem AND the student's own attempt", async () => {
    const res = await ask({
      question: 'ساعدني أحل',
      context: { source: 'ask', mode: 'solve_diagnose' },
    });
    const reply = res.json().reply;
    expect(reply.responseType).toBe('question');
    expect(reply.needsClarification).toBe(true);
    expect(reply.message).toContain('المسألة');
    expect(reply.message).toContain('محاولتك');
  });

  it('quick_review opens the prerequisite check directly (no clarification gate)', async () => {
    const res = await ask({
      question: 'راجع معي بسرعة',
      context: { source: 'ask', mode: 'quick_review' },
    });
    const reply = res.json().reply;
    expect(reply.responseType).toBe('question');
    // The first step IS the diagnostic — the program is already running.
    expect(reply.needsClarification).toBe(false);
    expect(reply.message).toContain('الأساس');
  });

  it('a mode conversation continues past the first turn and persists the mode on the thread', async () => {
    const first = await ask({
      question: 'حضّرني لسبر',
      context: { source: 'ask', mode: 'exam_prep' },
    });
    const conversationId = first.json().conversationId as string;
    const second = await ask({
      question: 'الرياضيات، المعادلات والمساحات، يوم الخميس، ساعة يوميًا',
      conversationId,
      context: { source: 'ask', mode: 'exam_prep' },
    });
    expect(second.statusCode).toBe(201);
    // Past the collection step: the program advances instead of re-asking.
    expect(second.json().reply.needsClarification).toBe(false);
    expect(second.json().reply.responseType).toBe('next_step');

    const hist = await app.inject({
      method: 'GET',
      url: `/api/v1/tutor/conversations/${conversationId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(hist.json().messages).toHaveLength(4);
    // The GET echoes the program id so a restored thread can resume it.
    expect(hist.json().mode).toBe('exam_prep');
  });

  it('a conversation without a program restores with mode null', async () => {
    const res = await ask({ question: 'ما مساحة المستطيل؟' });
    const hist = await app.inject({
      method: 'GET',
      url: `/api/v1/tutor/conversations/${res.json().conversationId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(hist.json().mode).toBeNull();
  });

  it('every mode works in English too (labels are display-only, ids are the wire)', async () => {
    const en = await app.inject({
      method: 'POST',
      url: '/api/v1/students',
      payload: { name: 'Sam', grade: 8, language: 'en', color: '#1CB0F6', dailyGoal: 3 },
    });
    const enToken = en.json().token;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tutor/messages',
      payload: { question: 'Prep me for a quiz', context: { source: 'ask', mode: 'exam_prep' } },
      headers: { authorization: `Bearer ${enToken}` },
    });
    const reply = res.json().reply;
    expect(reply.needsClarification).toBe(true);
    expect(reply.message).toContain('subject');
    expect(reply.message).toContain('topics');
  });
});
