/**
 * Server-side idempotency for POST /students: a client-generated
 * `installationId` must make a retry after a LOST response (the server
 * created the account, but the client never received the reply — dropped
 * connection, killed process) return the SAME account with a fresh token,
 * never a second account. Client-side in-flight locking (RegistrationSync)
 * only protects against concurrent calls within one running process; this
 * is the guarantee that survives across processes/network failures, which
 * the client alone cannot provide.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
// Type-only: erased at compile time, doesn't affect the MOCK_LLM env-var
// ordering the runtime `await import(...)` below depends on.
import type { MemoryStore as MemoryStoreType } from '../src/store/memory.js';

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

describe('POST /students idempotency (installationId)', () => {
  it('simulated lost response: retrying with the same installationId returns the SAME student, not a duplicate', async () => {
    const installationId = 'device-abc-123-lost-response';

    // First attempt: the server processes it and would normally reply, but
    // imagine the response never reached the client (dropped connection).
    const first = await createStudent({
      name: 'Lina', grade: 6, language: 'ar', installationId, dailyGoal: 3,
    });
    expect(first.statusCode).toBe(201);
    const firstStudentId = first.json().studentId;
    const firstToken = first.json().token;

    // The client, having never seen `first`'s response, retries onboarding
    // from scratch with the same installationId (the whole point of the id
    // being persisted before the request, not derived from the response).
    const retry = await createStudent({
      name: 'Lina', grade: 6, language: 'ar', installationId, dailyGoal: 3,
    });
    expect(retry.statusCode).toBe(201);

    // SAME account — not a second one.
    expect(retry.json().studentId).toBe(firstStudentId);
    // A freshly issued token: the original was never delivered to any
    // client, so reissuing is safe and necessary (the client has nothing
    // else to authenticate with).
    expect(retry.json().token).not.toBe(firstToken);

    // The FIRST token is now dead — proves the server actually rotated it
    // rather than just returning a second live credential for the same
    // account (which would leave two valid tokens outstanding).
    const meWithOldToken = await app.inject({
      method: 'GET', url: '/api/v1/students/me', headers: bearer(firstToken),
    });
    expect(meWithOldToken.statusCode).toBe(401);

    // The NEW token works.
    const meWithNewToken = await app.inject({
      method: 'GET', url: '/api/v1/students/me', headers: bearer(retry.json().token),
    });
    expect(meWithNewToken.statusCode).toBe(200);
    expect(meWithNewToken.json().id).toBe(firstStudentId);
  });

  it('repeated retries (3x) all collapse onto the same single account', async () => {
    const installationId = 'device-repeated-retry';
    const ids = new Set<string>();
    let lastToken = '';
    for (let i = 0; i < 3; i++) {
      const res = await createStudent({
        name: 'Sami', grade: 8, language: 'en', installationId, dailyGoal: 3,
      });
      expect(res.statusCode).toBe(201);
      ids.add(res.json().studentId);
      lastToken = res.json().token;
    }
    expect(ids.size).toBe(1); // never more than one account

    const me = await app.inject({ method: 'GET', url: '/api/v1/students/me', headers: bearer(lastToken) });
    expect(me.statusCode).toBe(200);
  });

  it('a different installationId always creates a genuinely new account', async () => {
    const a = await createStudent({ name: 'X', grade: 5, language: 'en', installationId: 'device-a', dailyGoal: 3 });
    const b = await createStudent({ name: 'X', grade: 5, language: 'en', installationId: 'device-b', dailyGoal: 3 });
    expect(a.json().studentId).not.toBe(b.json().studentId);
  });

  it('omitting installationId keeps the old always-create behavior (back-compat)', async () => {
    const a = await createStudent({ name: 'NoId', grade: 5, language: 'en', dailyGoal: 3 });
    const b = await createStudent({ name: 'NoId', grade: 5, language: 'en', dailyGoal: 3 });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(a.json().studentId).not.toBe(b.json().studentId);
  });

  it('a retry preserves the original profile fields, even if the retry body drifts slightly', async () => {
    // Onboarding always resends the exact same locally-saved profile, but
    // this proves the match is keyed on installationId, not on the fields
    // matching byte-for-byte — the account found is the one already
    // created, untouched, regardless of what the retry body says.
    const installationId = 'device-drift';
    const first = await createStudent({
      name: 'Original', grade: 4, language: 'ar', interests: ['tech_robotics'], installationId, dailyGoal: 3,
    });
    const retry = await createStudent({
      name: 'DifferentName', grade: 9, language: 'en', installationId, dailyGoal: 5,
    });
    expect(retry.json().studentId).toBe(first.json().studentId);
    expect(retry.json().student.name).toBe('Original');
    expect(retry.json().student.grade).toBe(4);
    expect(retry.json().student.interests).toEqual(['tech_robotics']);
  });

  it('rejects an installationId shorter than 8 characters (guards against accidental empty/weak ids)', async () => {
    const res = await createStudent({ name: 'X', grade: 5, language: 'en', installationId: 'short', dailyGoal: 3 });
    expect(res.statusCode).toBe(400);
  });
});

/**
 * Wraps MemoryStore with a small artificial delay on every operation.
 * MemoryStore is otherwise synchronous-fast (no real I/O), and
 * `fastify.inject()` dispatches each injected request's processing via a
 * macrotask — with zero real latency, a Promise.all() of injected requests
 * does NOT actually overlap in execution: each one's all-microtask chain
 * runs to full completion (including routes/students.ts's in-flight-map
 * cleanup) before the next one is even dispatched, so the race this suite
 * exists to test never actually occurs. A real Postgres-backed deployment
 * has genuine network round-trip latency on every query, which is exactly
 * the window that lets concurrent requests interleave. This delay
 * reproduces that real-world window deterministically, so `Promise.all()`
 * below exercises the ACTUAL race the in-flight lock is built to close,
 * not an accidentally-sequential approximation of it.
 */
class SlowStore extends MemoryStore {
  private delay() {
    return new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  override async getStudentByInstallationId(installationId: string) {
    await this.delay();
    return super.getStudentByInstallationId(installationId);
  }
  override async createStudent(data: Parameters<MemoryStoreType['createStudent']>[0]) {
    await this.delay();
    return super.createStudent(data);
  }
  override async updateStudent(id: string, patch: Parameters<MemoryStoreType['updateStudent']>[1]) {
    await this.delay();
    return super.updateStudent(id, patch);
  }
}

describe('POST /students true concurrency (same installationId, fired at the same time)', () => {
  let slowApp: FastifyInstance;
  async function post(payload: Record<string, unknown>) {
    return slowApp.inject({ method: 'POST', url: '/api/v1/students', payload });
  }

  beforeEach(async () => {
    slowApp = await buildApp({ store: new SlowStore(), provider: new MockProvider() });
  });

  it('N simultaneous requests: no 500s, exactly one account, and every response carries the SAME valid token', async () => {
    const installationId = 'device-concurrent-race';

    // Promise.all fires all N requests before any of them has resolved —
    // genuinely concurrent (verified against SlowStore's artificial
    // latency, not just fired-close-together). Without the in-flight lock
    // in routes/students.ts, each of these would race
    // getStudentByInstallationId (all seeing "not found") and then race
    // createStudent — for MemoryStore that used to mean N silent duplicate
    // accounts; for a real unique-constrained Postgres column it would mean
    // an unhandled P2002 rejection surfacing as a 500 to N-1 callers.
    const N = 8;
    const responses = await Promise.all(
      Array.from({ length: N }, () =>
        post({ name: 'Concurrent', grade: 6, language: 'en', installationId, dailyGoal: 3 }),
      ),
    );

    for (const res of responses) expect(res.statusCode).toBe(201);

    const studentIds = new Set(responses.map((r) => r.json().studentId));
    expect(studentIds.size).toBe(1); // exactly one account — never a duplicate

    // Concurrent siblings collapse onto the SAME in-flight attempt, so they
    // all get the SAME token — none of them can have invalidated a token
    // another caller already received, because only one was ever issued.
    const tokens = new Set(responses.map((r) => r.json().token));
    expect(tokens.size).toBe(1);

    const [token] = tokens;
    const me = await slowApp.inject({ method: 'GET', url: '/api/v1/students/me', headers: bearer(token) });
    expect(me.statusCode).toBe(200);
    expect(me.json().id).toBe([...studentIds][0]);
  });

  it('a token already returned to one concurrent caller keeps working after its siblings resolve', async () => {
    const installationId = 'device-concurrent-token-safety';
    const [a, b, c] = await Promise.all([
      post({ name: 'X', grade: 5, language: 'en', installationId, dailyGoal: 3 }),
      post({ name: 'X', grade: 5, language: 'en', installationId, dailyGoal: 3 }),
      post({ name: 'X', grade: 5, language: 'en', installationId, dailyGoal: 3 }),
    ]);
    expect(a.json().token).toBe(b.json().token);
    expect(b.json().token).toBe(c.json().token);

    // Use the token as a real client would immediately after registering —
    // still valid even though two sibling requests "raced" alongside it.
    const me = await slowApp.inject({
      method: 'GET', url: '/api/v1/students/me', headers: bearer(a.json().token),
    });
    expect(me.statusCode).toBe(200);

    // A LATER, separate (non-concurrent) retry is the genuine lost-response
    // case this endpoint exists for — that one is still fine to rotate the
    // token, since nothing is racing it anymore.
    const later = await post({ name: 'X', grade: 5, language: 'en', installationId, dailyGoal: 3 });
    expect(later.json().studentId).toBe(a.json().studentId);
    expect(later.json().token).not.toBe(a.json().token);
  });

  it('mixed installationIds racing at the same time never cross-contaminate accounts', async () => {
    const responses = await Promise.all([
      post({ name: 'A', grade: 4, language: 'en', installationId: 'device-mix-a', dailyGoal: 3 }),
      post({ name: 'B', grade: 5, language: 'en', installationId: 'device-mix-b', dailyGoal: 3 }),
      post({ name: 'A', grade: 4, language: 'en', installationId: 'device-mix-a', dailyGoal: 3 }),
      post({ name: 'C', grade: 6, language: 'en', installationId: 'device-mix-c', dailyGoal: 3 }),
      post({ name: 'B', grade: 5, language: 'en', installationId: 'device-mix-b', dailyGoal: 3 }),
    ]);
    for (const res of responses) expect(res.statusCode).toBe(201);

    const byName = (n: string) => responses.filter((r) => r.json().student.name === n);
    // Each installationId still collapses to exactly one account...
    expect(new Set(byName('A').map((r) => r.json().studentId)).size).toBe(1);
    expect(new Set(byName('B').map((r) => r.json().studentId)).size).toBe(1);
    // ...but different installationIds never share one.
    const allIds = new Set(responses.map((r) => r.json().studentId));
    expect(allIds.size).toBe(3);
  });
});

describe('POST /students cross-process unique-constraint race (defense in depth)', () => {
  it('a unique-constraint conflict on create falls back to the winning row instead of a 500', async () => {
    // The in-flight lock in routes/students.ts fully prevents a same-process
    // race from ever reaching the store's unique-constraint check (proven
    // above). The ONLY way `createStudent` can still throw a conflict is a
    // genuinely different process/instance racing the same installationId
    // against a shared database — not reproducible with a single in-memory
    // store from one test. This fault-injects that exact failure shape
    // (Prisma's P2002 on a real Postgres unique index) directly against the
    // store layer, to prove routes/students.ts's catch-and-recover branch
    // is correct in isolation, independent of timing.
    class RacyStore extends MemoryStore {
      private raced = false;
      override async createStudent(data: Parameters<MemoryStoreType['createStudent']>[0]) {
        if (!this.raced && data.installationId === 'device-cross-process-race') {
          this.raced = true;
          // Simulate another process's insert landing first: the row really
          // exists afterward (so the fallback lookup finds a genuine
          // winner), but THIS call is told it lost the race, exactly like a
          // real Postgres unique-index violation would report.
          await super.createStudent(data);
          const err = new Error('Unique constraint failed on the fields: (`installationId`)') as Error & {
            code: string;
          };
          err.code = 'P2002';
          throw err;
        }
        return super.createStudent(data);
      }
    }

    const racyApp = await buildApp({ store: new RacyStore(), provider: new MockProvider() });
    const res = await racyApp.inject({
      method: 'POST',
      url: '/api/v1/students',
      payload: {
        name: 'Racy', grade: 5, language: 'en', installationId: 'device-cross-process-race', dailyGoal: 3,
      },
    });

    // Not a 500 — the conflict was recovered from.
    expect(res.statusCode).toBe(201);
    expect(res.json().token).toBeTruthy();

    // And the returned token genuinely works against the row that won.
    const me = await racyApp.inject({
      method: 'GET', url: '/api/v1/students/me', headers: bearer(res.json().token),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().name).toBe('Racy');
  });
});
