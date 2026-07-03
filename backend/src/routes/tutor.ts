/**
 * Tutor routes — the "Ask OpenMind" learning assistant. One vertical slice:
 * authenticated student → moderated question → context-aware structured LLM
 * reply (ContentProvider seam, so mock mode works keyless) → persisted
 * conversation history for continuity and future personalization.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { makeAuthHook } from '../auth.js';
import { config } from '../config.js';
import { stageForGrade } from '../learning/stage.js';
import { moderate } from '../llm/moderation.js';
import { metrics } from '../pipeline/metrics.js';
import type { ContentProvider } from '../pipeline/provider.js';
import { AskTutorBody } from '../schemas.js';
import type { Store } from '../store/types.js';

/** How many prior turns ride along as conversation memory. */
const HISTORY_TURNS = 12;

export async function tutorRoutes(app: FastifyInstance, opts: { store: Store; provider: ContentProvider }) {
  const { store, provider } = opts;
  const auth = makeAuthHook(store);

  // simple per-student rate limit, same in-process pattern as game generation
  const messageTimestamps = new Map<string, number[]>();

  app.post('/api/v1/tutor/messages', { preHandler: auth }, async (req, reply) => {
    const parsed = AskTutorBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid body', requestId: req.id },
      });
    }
    const student = req.student!;
    const body = parsed.data;

    const now = Date.now();
    const stamps = (messageTimestamps.get(student.id) ?? []).filter((t) => now - t < 3_600_000);
    if (stamps.length >= config.maxTutorMessagesPerHour) {
      return reply.code(429).send({
        error: { code: 'RATE_LIMITED', message: 'too many questions this hour — take a short break!', requestId: req.id },
      });
    }

    const mod = await moderate([body.question], app.log);
    if (mod.flagged) {
      metrics.bump('tutor_pre_flagged');
      return reply.code(422).send({
        error: { code: 'QUESTION_REJECTED', message: 'that question cannot be answered here', requestId: req.id },
      });
    }

    const conversationId = body.conversationId ?? randomUUID();
    const history = body.conversationId
      ? (await store.listTutorMessages(student.id, conversationId, HISTORY_TURNS)).map((m) => ({
          role: m.role,
          content: m.content,
        }))
      : [];

    let result;
    try {
      result = await provider.tutorReply({
        // Identity comes from the authenticated row — never from the client.
        // stage is resolved server-side so the tutor always teaches for the
        // learner's true educational stage.
        student: {
          name: student.name,
          grade: student.grade,
          stage: stageForGrade(student.grade),
          language: student.language,
          interest: student.interest,
          learningContext: student.learningContext,
        },
        question: body.question,
        context: body.context ?? null,
        history,
      });
    } catch (err) {
      req.log.error(err, '[tutor] reply failed');
      return reply.code(502).send({
        error: { code: 'TUTOR_UNAVAILABLE', message: 'the tutor could not answer right now — try again', requestId: req.id },
      });
    }

    stamps.push(now);
    messageTimestamps.set(student.id, stamps);

    // Persist both turns; history failures must not eat a successful reply.
    try {
      await store.createTutorMessage({
        studentId: student.id,
        conversationId,
        role: 'student',
        content: body.question,
        responseType: null,
        context: (body.context as Record<string, unknown> | undefined) ?? null,
      });
      await store.createTutorMessage({
        studentId: student.id,
        conversationId,
        role: 'tutor',
        content: result.data.message,
        responseType: result.data.responseType,
        context: null,
      });
    } catch (err) {
      req.log.error(err, '[tutor] failed to persist conversation turn');
    }

    return reply.code(201).send({ conversationId, reply: result.data, model: result.model });
  });

  // Conversation history — lets the client restore a thread after a reload.
  app.get('/api/v1/tutor/conversations/:id', { preHandler: auth }, async (req) => {
    const { id } = req.params as { id: string };
    const messages = await store.listTutorMessages(req.student!.id, id, 100);
    return {
      conversationId: id,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        responseType: m.responseType,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  });
}
