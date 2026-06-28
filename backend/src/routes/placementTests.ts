/**
 * /api/v1/placement-tests — adaptive placement tests at the start of each
 * learning path.
 *
 * Flow:
 *   POST /               → start a test (body: learningPathId, theme) → first question
 *   POST /:id/answer     → submit an answer → { correct, nextQuestion (or null), progress }
 *   GET  /:id            → session status (progress, current difficulty)
 *   GET  /:id/result     → final result (placement node + mastery summary)
 *   GET  /me             → list the student's placement test history
 *
 * The test auto-completes after ~10 questions OR when the bank is exhausted.
 * Placement is computed by the engine in pipeline/placement.ts.
 */
import type { FastifyInstance } from 'fastify';
import { makeAuthHook } from '../auth.js';
import {
  PLACEMENT_THEMES,
  StartPlacementTestBody,
  SubmitAnswerBody,
  THEME_LABELS,
} from '../schemas.js';
import {
  TARGET_QUESTION_COUNT,
  gradeAnswer,
  masteryRatio,
  nextDifficulty,
  pickNextQuestion,
  placeAtNode,
  stripAnswer,
} from '../pipeline/placement.js';
import type {
  PlacementAnswer,
  PlacementTestSessionRow,
  QuestionRow,
  Store,
  StudentRow,
} from '../store/types.js';

function sessionView(s: PlacementTestSessionRow) {
  return {
    id: s.id,
    learningPathId: s.learningPathId,
    theme: s.theme,
    themeLabel: THEME_LABELS[s.theme],
    status: s.status,
    currentDifficulty: s.currentDifficulty,
    questionCount: s.questionCount,
    answeredCount: s.answers.length,
    placedNodeId: s.placedNodeId,
    startedAt: s.startedAt.toISOString(),
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
  };
}

function studentQuestionView(q: QuestionRow) {
  return {
    id: q.id,
    type: q.type,
    difficulty: q.difficulty,
    content: stripAnswer(q),
    linkedNodeId: q.linkedNodeId,
  };
}

export async function placementTestRoutes(app: FastifyInstance, opts: { store: Store }) {
  const { store } = opts;
  const auth = makeAuthHook(store);

  const err = (
    reply: { code: (n: number) => { send: (b: unknown) => unknown } },
    reqId: string,
    status: number,
    code: string,
    message: string,
  ) => reply.code(status).send({ error: { code, message, requestId: reqId } });

  // ─── GET /me — list the student's placement test history ─────────────────
  app.get('/api/v1/placement-tests/me', { preHandler: auth }, async (req) => {
    const student = req.student as StudentRow;
    const tests = await store.listPlacementTestsByStudent(student.id);
    return { items: tests.map(sessionView), total: tests.length };
  });

  // ─── GET themes — the three available themes (جسر / طريق / خريطة) ─────────
  app.get('/api/v1/placement-tests/themes', { preHandler: auth }, async () => {
    return {
      items: PLACEMENT_THEMES.map((t) => ({ id: t, ...THEME_LABELS[t] })),
    };
  });

  // ─── POST / — start a placement test ─────────────────────────────────────
  app.post('/api/v1/placement-tests', { preHandler: auth }, async (req, reply) => {
    const student = req.student as StudentRow;
    const parsed = StartPlacementTestBody.safeParse(req.body);
    if (!parsed.success) {
      return err(reply, req.id, 400, 'BAD_REQUEST', parsed.error.issues[0]?.message ?? 'invalid body');
    }
    const { learningPathId, theme } = parsed.data;

    // the learning path must exist
    const lp = await store.getLearningPath(learningPathId);
    if (!lp) return err(reply, req.id, 404, 'NOT_FOUND', 'learning path not found');

    // resume an in-progress test if one exists for this student + path
    const active = await store.getActivePlacementTest(student.id, learningPathId);
    let session: PlacementTestSessionRow;
    if (active) {
      session = active;
    } else {
      session = await store.createPlacementTest({
        studentId: student.id,
        learningPathId,
        theme,
      });
    }

    // pick the first/next question
    const bank = await store.listQuestions(learningPathId);
    if (bank.length === 0) {
      return err(reply, req.id, 409, 'NO_QUESTIONS', 'this learning path has no questions in its bank yet');
    }
    const { question, difficulty } = pickNextQuestion(bank, session);
    if (!question) {
      // bank exhausted — shouldn't happen on a fresh session, but handle it
      await store.updatePlacementTest(session.id, { status: 'completed', completedAt: new Date() });
      return reply.code(200).send({ session: sessionView({ ...session, status: 'completed' }), question: null, progress: { answered: 0, total: TARGET_QUESTION_COUNT, done: true } });
    }

    // sync the current difficulty to the picked question's difficulty
    if (difficulty !== session.currentDifficulty) {
      session = await store.updatePlacementTest(session.id, { currentDifficulty: difficulty });
    }

    return reply.code(201).send({
      session: sessionView(session),
      question: studentQuestionView(question),
      progress: { answered: session.answers.length, total: TARGET_QUESTION_COUNT, done: false },
    });
  });

  // ─── POST /:id/answer — submit an answer ─────────────────────────────────
  app.post('/api/v1/placement-tests/:id/answer', { preHandler: auth }, async (req, reply) => {
    const student = req.student as StudentRow;
    const { id } = req.params as { id: string };
    const parsed = SubmitAnswerBody.safeParse(req.body);
    if (!parsed.success) {
      return err(reply, req.id, 400, 'BAD_REQUEST', parsed.error.issues[0]?.message ?? 'invalid body');
    }
    const { questionId, response } = parsed.data;

    const session = await store.getPlacementTest(id);
    if (!session || session.studentId !== student.id) {
      return err(reply, req.id, 404, 'NOT_FOUND', 'placement test not found');
    }
    if (session.status === 'completed') {
      return err(reply, req.id, 409, 'ALREADY_COMPLETED', 'this placement test is already finished');
    }

    const question = await store.getQuestion(questionId);
    if (!question || question.learningPathId !== session.learningPathId) {
      return err(reply, req.id, 404, 'NOT_FOUND', 'question not found in this learning path');
    }
    // prevent double-answering the same question
    if (session.answers.some((a) => a.questionId === questionId)) {
      return err(reply, req.id, 409, 'ALREADY_ANSWERED', 'this question was already answered');
    }

    // grade + record
    const correct = gradeAnswer(question, response as Record<string, unknown>);
    const answer: PlacementAnswer = {
      questionId,
      type: question.type,
      difficulty: question.difficulty,
      correct,
      response: response as Record<string, unknown>,
      answeredAt: new Date().toISOString(),
    };
    const updatedAnswers = [...session.answers, answer];
    const newDifficulty = nextDifficulty(session.currentDifficulty, correct);
    const answeredCount = updatedAnswers.length;
    const isDone = answeredCount >= TARGET_QUESTION_COUNT;

    let patch: Partial<PlacementTestSessionRow>;
    if (isDone) {
      // compute placement
      const bank = await store.listQuestions(session.learningPathId);
      const nodes = await store.listPathNodes(session.learningPathId);
      const placedNode = placeAtNode(updatedAnswers, bank, nodes);
      patch = {
        answers: updatedAnswers,
        currentDifficulty: newDifficulty,
        questionCount: answeredCount,
        status: 'completed',
        completedAt: new Date(),
        placedNodeId: placedNode?.id ?? null,
      };
    } else {
      patch = {
        answers: updatedAnswers,
        currentDifficulty: newDifficulty,
        questionCount: answeredCount,
      };
    }
    const updated = await store.updatePlacementTest(id, patch);

    // pick the next question (or null if done / bank exhausted)
    let nextQuestion: { question: QuestionRow | null; difficulty: typeof newDifficulty };
    if (isDone) {
      nextQuestion = { question: null, difficulty: newDifficulty };
    } else {
      const bank = await store.listQuestions(session.learningPathId);
      nextQuestion = pickNextQuestion(bank, updated);
      if (nextQuestion.difficulty !== updated.currentDifficulty) {
        await store.updatePlacementTest(id, { currentDifficulty: nextQuestion.difficulty });
      }
      // bank exhausted before reaching 10 → end the test now
      if (!nextQuestion.question) {
        const nodes = await store.listPathNodes(session.learningPathId);
        const placedNode = placeAtNode(updatedAnswers, bank, nodes);
        await store.updatePlacementTest(id, {
          status: 'completed',
          completedAt: new Date(),
          placedNodeId: placedNode?.id ?? null,
        });
      }
    }

    return reply.code(200).send({
      correct,
      explanation: question.content['explanation'] ?? null,
      explanationAr: question.content['explanationAr'] ?? null,
      nextQuestion: nextQuestion.question ? studentQuestionView(nextQuestion.question) : null,
      progress: {
        answered: answeredCount,
        total: TARGET_QUESTION_COUNT,
        done: isDone || !nextQuestion.question,
        currentDifficulty: nextQuestion.difficulty,
      },
      session: sessionView(
        nextQuestion.question
          ? { ...updated, currentDifficulty: nextQuestion.difficulty }
          : { ...updated, status: 'completed', completedAt: new Date() },
      ),
    });
  });

  // ─── GET /:id — session status ───────────────────────────────────────────
  app.get('/api/v1/placement-tests/:id', { preHandler: auth }, async (req, reply) => {
    const student = req.student as StudentRow;
    const { id } = req.params as { id: string };
    const session = await store.getPlacementTest(id);
    if (!session || session.studentId !== student.id) {
      return err(reply, req.id, 404, 'NOT_FOUND', 'placement test not found');
    }
    return sessionView(session);
  });

  // ─── GET /:id/result — final result with placement + mastery ─────────────
  app.get('/api/v1/placement-tests/:id/result', { preHandler: auth }, async (req, reply) => {
    const student = req.student as StudentRow;
    const { id } = req.params as { id: string };
    const session = await store.getPlacementTest(id);
    if (!session || session.studentId !== student.id) {
      return err(reply, req.id, 404, 'NOT_FOUND', 'placement test not found');
    }
    if (session.status !== 'completed') {
      return err(reply, req.id, 409, 'NOT_COMPLETED', 'placement test is still in progress');
    }

    const correctCount = session.answers.filter((a) => a.correct).length;
    const ratio = masteryRatio(session.answers);
    let placedNodeTitle: string | null = null;
    let placedNodeOrderIndex: number | null = null;
    if (session.placedNodeId) {
      const node = await store.getPathNode(session.placedNodeId);
      if (node) {
        placedNodeTitle = node.title;
        placedNodeOrderIndex = node.orderIndex;
      }
    }

    return {
      sessionId: session.id,
      learningPathId: session.learningPathId,
      theme: session.theme,
      themeLabel: THEME_LABELS[session.theme],
      status: session.status,
      totalQuestions: session.questionCount,
      correctCount,
      finalDifficulty: session.currentDifficulty,
      masteryRatio: Math.round(ratio * 100) / 100,
      placedNodeId: session.placedNodeId,
      placedNodeTitle,
      placedNodeOrderIndex,
      answers: session.answers.map((a) => ({
        questionId: a.questionId,
        type: a.type,
        difficulty: a.difficulty,
        correct: a.correct,
        answeredAt: a.answeredAt,
      })),
      startedAt: session.startedAt.toISOString(),
      completedAt: session.completedAt ? session.completedAt.toISOString() : null,
    };
  });

  // ─── POST /:id/abandon — give up (sets status to abandoned) ───────────────
  app.post('/api/v1/placement-tests/:id/abandon', { preHandler: auth }, async (req, reply) => {
    const student = req.student as StudentRow;
    const { id } = req.params as { id: string };
    const session = await store.getPlacementTest(id);
    if (!session || session.studentId !== student.id) {
      return err(reply, req.id, 404, 'NOT_FOUND', 'placement test not found');
    }
    if (session.status !== 'in_progress') {
      return err(reply, req.id, 409, 'NOT_IN_PROGRESS', 'placement test is not in progress');
    }
    const updated = await store.updatePlacementTest(id, { status: 'abandoned', completedAt: new Date() });
    return sessionView(updated);
  });
}
