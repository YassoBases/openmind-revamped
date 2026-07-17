import type { FastifyInstance } from 'fastify';
import { makeAuthHook, newToken } from '../auth.js';
import { stageForGrade } from '../learning/stage.js';
import { CreateStudentBody, PatchStudentBody } from '../schemas.js';
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

export async function studentRoutes(app: FastifyInstance, opts: { store: Store }) {
  const { store } = opts;
  const auth = makeAuthHook(store);

  // Onboarding: nickname-only account → { studentId, token }.
  app.post('/api/v1/students', async (req, reply) => {
    const parsed = CreateStudentBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid body', requestId: req.id },
      });
    }
    const { token, hash } = newToken();
    const s = await store.createStudent({
      name: parsed.data.name,
      gender: parsed.data.gender ?? null,
      grade: parsed.data.grade,
      language: parsed.data.language,
      color: parsed.data.color,
      interest: parsed.data.interest ?? null,
      learningContext: parsed.data.learningContext ?? null,
      interests: parsed.data.interests ?? [],
      dailyGoal: parsed.data.dailyGoal,
      tokenHash: hash,
    });
    return reply.code(201).send({ studentId: s.id, token, student: studentView(s) });
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
