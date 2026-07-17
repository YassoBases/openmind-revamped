/**
 * Onboarding interests (1-2, both stages) — the new primary AI-flavor signal
 * that replaces the legacy learningContext lens for new profiles — and the
 * Arabic-grammar-only gender field. Same fastify.inject() harness against the
 * in-memory store in MOCK_LLM mode as stage.test.ts/api.test.ts.
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

async function createStudent(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/v1/students', payload });
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  app = await buildApp({ store: new MemoryStore(), provider: new MockProvider() });
});

describe('interests field', () => {
  it('accepts 1-2 interests at creation and returns them on the profile', async () => {
    const res = await createStudent({
      name: 'Yara', grade: 8, language: 'ar', interests: ['tech_robotics', 'nature_environment'], dailyGoal: 3,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().student.interests).toEqual(['tech_robotics', 'nature_environment']);
  });

  it('defaults to an empty array when omitted (back-compat with existing callers)', async () => {
    const res = await createStudent({ name: 'Omar', grade: 5, language: 'en', dailyGoal: 3 });
    expect(res.statusCode).toBe(201);
    expect(res.json().student.interests).toEqual([]);
  });

  it('rejects more than 2 interests', async () => {
    const res = await createStudent({
      name: 'X', grade: 5, language: 'en',
      interests: ['tech_robotics', 'nature_environment', 'sports_movement'],
      dailyGoal: 3,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('rejects an unknown interest id', async () => {
    const res = await createStudent({ name: 'X', grade: 5, language: 'en', interests: ['unicorns'], dailyGoal: 3 });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH updates interests without resetting other untouched fields', async () => {
    const created = await createStudent({ name: 'Lina', grade: 6, language: 'ar', color: '#1CB0F6', dailyGoal: 5 });
    const token = created.json().token;
    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/v1/students/me',
      headers: bearer(token),
      payload: { interests: ['drawing_design'] },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().interests).toEqual(['drawing_design']);
    expect(patched.json().color).toBe('#1CB0F6'); // not reset to the create-schema default
    expect(patched.json().dailyGoal).toBe(5);
  });
});

describe('interests drive the tutor (primary signal, rotation, legacy fallback)', () => {
  it('flavors the reply from the chosen interest, rotating across turns when two are set', async () => {
    const created = await createStudent({
      name: 'سلمى', grade: 8, language: 'ar', interests: ['tech_robotics', 'nature_environment'], dailyGoal: 3,
    });
    const token = created.json().token;

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/tutor/messages',
      headers: bearer(token),
      payload: { question: 'كيف أحسب مساحة المثلث؟' },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().reply.message).toContain('التقنية والروبوتات');
    expect(first.json().reply.message).not.toContain('الطبيعة والبيئة');

    const conversationId = first.json().conversationId;
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/tutor/messages',
      headers: bearer(token),
      payload: { question: 'وكيف أحسب محيطه؟', conversationId },
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().reply.message).toContain('الطبيعة والبيئة');
  });

  it('falls back to the legacy lens only when interests is empty', async () => {
    const created = await createStudent({ name: 'نور', grade: 7, language: 'ar', dailyGoal: 3 });
    const token = created.json().token;
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/students/me',
      headers: bearer(token),
      payload: { learningContext: 'market' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tutor/messages',
      headers: bearer(token),
      payload: { question: 'كيف أحسب مساحة المثلث؟' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().reply.message).toContain('السوق');
  });

  it('prefers active interests over a legacy lens when both are present', async () => {
    const created = await createStudent({
      name: 'هدى', grade: 7, language: 'ar', interests: ['drawing_design'], dailyGoal: 3,
    });
    const token = created.json().token;
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/students/me',
      headers: bearer(token),
      payload: { learningContext: 'market' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tutor/messages',
      headers: bearer(token),
      payload: { question: 'كيف أحسب مساحة المثلث؟' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().reply.message).toContain('الرسم والتصميم');
    expect(res.json().reply.message).not.toContain('السوق');
  });

  it('also personalizes PRIMARY-stage explanations (interests are not middle-school only)', async () => {
    const created = await createStudent({
      name: 'كريم', grade: 3, language: 'ar', interests: ['nature_environment'], dailyGoal: 3,
    });
    const token = created.json().token;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tutor/messages',
      headers: bearer(token),
      payload: { question: 'ما هو الضرب؟' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().reply.message).toContain('الطبيعة والبيئة');
  });

  it('switching an interest changes which world the next example is drawn from', async () => {
    const created = await createStudent({
      name: 'ريان', grade: 8, language: 'ar', interests: ['sports_movement'], dailyGoal: 3,
    });
    const token = created.json().token;
    const before = await app.inject({
      method: 'POST',
      url: '/api/v1/tutor/messages',
      headers: bearer(token),
      payload: { question: 'كيف أحسب مساحة المثلث؟' },
    });
    expect(before.json().reply.message).toContain('الرياضة والحركة');

    await app.inject({
      method: 'PATCH',
      url: '/api/v1/students/me',
      headers: bearer(token),
      payload: { interests: ['tech_robotics'] },
    });
    const after = await app.inject({
      method: 'POST',
      url: '/api/v1/tutor/messages',
      headers: bearer(token),
      payload: { question: 'كيف أحسب مساحة المثلث؟' },
    });
    expect(after.json().reply.message).toContain('التقنية والروبوتات');
    expect(after.json().reply.message).not.toContain('الرياضة والحركة');
  });
});

describe('gender affects Arabic grammatical addressing in Ask Hudhud only', () => {
  async function askThenReport(gender: 'm' | 'f' | null) {
    const created = await createStudent({
      name: 'سارة', grade: 7, language: 'ar', gender, dailyGoal: 3,
    });
    const token = created.json().token;
    const auth = bearer(token);
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/tutor/messages',
      headers: auth,
      payload: { question: 'رتب لي مراحل دورة الماء' },
    });
    const conversationId = first.json().conversationId;
    return app.inject({
      method: 'POST',
      url: '/api/v1/tutor/messages',
      headers: auth,
      payload: {
        question: 'رتبت المراحل: تبخر ثم تكاثف ثم هطول ثم جريان',
        conversationId,
        interactiveResult: {
          blockType: 'order_sequence',
          attempted: true,
          answerOrState: 'رتبت: تبخر → تكاثف → هطول → جريان',
          correctnessOrOutcome: 'correct',
        },
      },
    });
  }

  it('conjugates the congratulation to a male student', async () => {
    const res = await askThenReport('m');
    expect(res.statusCode).toBe(201);
    expect(res.json().reply.message).toContain('أحسنتَ');
  });

  it('conjugates the congratulation to a female student', async () => {
    const res = await askThenReport('f');
    expect(res.statusCode).toBe(201);
    expect(res.json().reply.message).toContain('أحسنتِ');
  });

  it('falls back to neutral phrasing when gender is unset', async () => {
    const res = await askThenReport(null);
    expect(res.statusCode).toBe(201);
    // neutral form only — neither gendered variant present
    expect(res.json().reply.message).not.toContain('أحسنتَ');
    expect(res.json().reply.message).not.toContain('أحسنتِ');
    expect(res.json().reply.message).toContain('أحسنت');
  });

  it('the substantive content is identical across genders — grammar only, never the explanation', async () => {
    const m = await askThenReport('m');
    const f = await askThenReport('f');
    // Strip the one gendered word, everything else must match verbatim.
    const stripGender = (s: string) => s.replace('أحسنتَ', '').replace('أحسنتِ', '');
    expect(stripGender(m.json().reply.message)).toBe(stripGender(f.json().reply.message));
  });
});

describe('gender', () => {
  it('persists via POST/GET/PATCH', async () => {
    const created = await createStudent({ name: 'ريم', grade: 4, language: 'ar', gender: 'f', dailyGoal: 3 });
    expect(created.statusCode).toBe(201);
    expect(created.json().student.gender).toBe('f');

    const token = created.json().token;
    const me = await app.inject({ method: 'GET', url: '/api/v1/students/me', headers: bearer(token) });
    expect(me.json().gender).toBe('f');

    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/v1/students/me',
      headers: bearer(token),
      payload: { gender: 'm' },
    });
    expect(patched.json().gender).toBe('m');
  });

  it('never leaks into tutor content — identical reply regardless of gender', async () => {
    const boy = await createStudent({ name: 'سامي', grade: 5, language: 'en', gender: 'm', dailyGoal: 3 });
    const girl = await createStudent({ name: 'سامي', grade: 5, language: 'en', gender: 'f', dailyGoal: 3 });
    const ask = (token: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/tutor/messages',
        headers: bearer(token),
        payload: { question: 'What is multiplication?' },
      });
    const a = await ask(boy.json().token);
    const b = await ask(girl.json().token);
    expect(a.statusCode).toBe(201);
    expect(a.json().reply.message).toBe(b.json().reply.message);
  });
});
