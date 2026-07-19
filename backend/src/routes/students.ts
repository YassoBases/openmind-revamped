import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import { makeAuthHook, newToken } from '../auth.js';
import { stageForGrade } from '../learning/stage.js';
import { CreateStudentBody, PatchStudentBody } from '../schemas.js';
import { isUniqueConstraintError } from '../store/errors.js';
import type { Store, StudentRow } from '../store/types.js';

export function studentView(s: StudentRow) {
  return {
    id: s.id,
    name: s.name,
    gender: s.gender,
    grade: s.grade,
    // The backend is the trusted resolver of the product mode; clients render
    // this instead of re-deriving it from a possibly-stale local grade.
    stage: stageForGrade(s.grade),
    language: s.language,
    color: s.color,
    interest: s.interest,
    learningContext: s.learningContext,
    interests: s.interests,
    dailyGoal: s.dailyGoal,
    xp: s.xp,
    streakCount: s.streakCount,
  };
}

type RegisterResult = { studentId: string; token: string; student: ReturnType<typeof studentView> };
type CreateStudentInput = z.infer<typeof CreateStudentBody>;

export async function studentRoutes(app: FastifyInstance, opts: { store: Store }) {
  const { store } = opts;
  const auth = makeAuthHook(store);

  async function createNew(body: CreateStudentInput, installationId: string | null): Promise<RegisterResult> {
    const { token, hash } = newToken();
    const s = await store.createStudent({
      name: body.name,
      gender: body.gender ?? null,
      grade: body.grade,
      language: body.language,
      color: body.color,
      interest: body.interest ?? null,
      learningContext: body.learningContext ?? null,
      interests: body.interests ?? [],
      dailyGoal: body.dailyGoal,
      tokenHash: hash,
      installationId,
    });
    return { studentId: s.id, token, student: studentView(s) };
  }

  // Since the raw token is never stored (only its hash — same as a
  // password), an existing row's original token can't be reissued verbatim;
  // this mints a FRESH one instead. Safe whenever it's reached deliberately
  // (a genuine lost-response retry, arriving after any earlier attempt for
  // this installationId has fully finished) — see registerOrReissue for why
  // it must never run as a side effect of a race with another in-flight
  // request for the SAME installationId.
  async function reissueFor(existing: StudentRow): Promise<RegisterResult> {
    const { token, hash } = newToken();
    const s = await store.updateStudent(existing.id, { tokenHash: hash });
    return { studentId: s.id, token, student: studentView(s) };
  }

  // Per-installationId in-flight registration lock. Without this, two
  // truly concurrent POST /students calls for the SAME installationId
  // (multiple tabs/devices, a client bug, a proxy replaying a slow
  // request) would both see "no existing student" and both fall through to
  // create-or-reissue — the loser's write would silently invalidate the
  // token the winner already returned to ITS caller, even though that
  // caller may already be using it. Collapsing concurrent callers onto the
  // SAME in-flight attempt means they all resolve to the SAME token: no
  // rotation, no race. A genuine retry that arrives later (after the first
  // attempt has fully finished — the normal lost-response case this
  // endpoint exists for) is unaffected: the map is empty again by then, so
  // it takes the normal existing-row-found → reissue path.
  //
  // Scoped per Fastify app instance (a closure over `store`, not a module
  // level Map) so separate app instances — e.g. one per test file — never
  // share state.
  const inFlight = new Map<string, Promise<RegisterResult>>();

  async function registerOrReissue(installationId: string, body: CreateStudentInput): Promise<RegisterResult> {
    const already = inFlight.get(installationId);
    if (already) return already;

    const attempt = (async (): Promise<RegisterResult> => {
      const existing = await store.getStudentByInstallationId(installationId);
      if (existing) return reissueFor(existing);
      try {
        return await createNew(body, installationId);
      } catch (err) {
        // Unique-constraint race: a DIFFERENT process (same-process races
        // are already collapsed above) created this installationId between
        // our lookup and our insert — the only way this branch is reached
        // at all. Not a 500: fall back to whichever row won and reissue its
        // token, exactly like a normal retry would.
        if (isUniqueConstraintError(err)) {
          const winner = await store.getStudentByInstallationId(installationId);
          if (winner) return reissueFor(winner);
        }
        throw err;
      }
    })();

    inFlight.set(installationId, attempt);
    try {
      return await attempt;
    } finally {
      inFlight.delete(installationId);
    }
  }

  // Onboarding: nickname-only account → { studentId, token }.
  //
  // Server-idempotent on `installationId`: a client that finished onboarding
  // but never received this response (dropped connection, killed process
  // before the reply landed) retries with the SAME installationId and gets
  // back the SAME account (see registerOrReissue for how concurrent retries
  // are kept from stepping on each other's token).
  app.post('/api/v1/students', async (req, reply) => {
    const parsed = CreateStudentBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid body', requestId: req.id },
      });
    }
    const result = parsed.data.installationId
      ? await registerOrReissue(parsed.data.installationId, parsed.data)
      : await createNew(parsed.data, null);
    return reply.code(201).send(result);
  });

  app.get('/api/v1/students/me', { preHandler: auth }, async (req) => studentView(req.student!));

  app.patch('/api/v1/students/me', { preHandler: auth }, async (req, reply) => {
    const parsed = PatchStudentBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid body', requestId: req.id },
      });
    }
    const s = await store.updateStudent(req.student!.id, { ...parsed.data });
    return studentView(s);
  });
}
