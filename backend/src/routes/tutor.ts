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
import { validateInteractivePayload } from '../tutor/contract.js';
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
        interactiveResult: body.interactiveResult ?? null,
        history,
      });
    } catch (err) {
      req.log.error(err, '[tutor] reply failed');
      return reply.code(502).send({
        error: { code: 'TUTOR_UNAVAILABLE', message: 'the tutor could not answer right now — try again', requestId: req.id },
      });
    }

    // Semantic gate on any offered interactive block: a payload that passed
    // the structural schema but is not genuinely renderable (bad ranges,
    // non-permutation order, dangling bucket ids…) is dropped, never shipped.
    if (result.data.interactivePayload) {
      const valid = validateInteractivePayload(result.data.interactivePayload);
      if (valid) {
        metrics.bump('tutor_interactive_offered');
      } else {
        req.log.warn({ type: result.data.interactivePayload.type }, '[tutor] invalid interactive payload dropped');
        metrics.bump('tutor_interactive_invalid');
      }
      result.data.interactivePayload = valid;
    }
    if (body.interactiveResult) metrics.bump('tutor_interactive_result');

    stamps.push(now);
    messageTimestamps.set(student.id, stamps);

    // Persist both turns; history failures must not eat a successful reply.
    // The student turn carries the interaction result, the tutor turn the
    // offered block — the same context column both stores already have — so
    // a restored thread can re-render its interactive moments.
    try {
      await store.createTutorMessage({
        studentId: student.id,
        conversationId,
        role: 'student',
        content: body.question,
        responseType: null,
        context: body.context || body.interactiveResult
          ? {
              ...((body.context as Record<string, unknown> | undefined) ?? {}),
              ...(body.interactiveResult ? { interactiveResult: body.interactiveResult } : {}),
            }
          : null,
      });
      await store.createTutorMessage({
        studentId: student.id,
        conversationId,
        role: 'tutor',
        content: result.data.message,
        responseType: result.data.responseType,
        context: result.data.interactivePayload
          ? { interactivePayload: result.data.interactivePayload }
          : null,
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
        // Interactive moments ride the context column: the block a tutor turn
        // offered, the result a student turn reported.
        interactivePayload: (m.context?.interactivePayload as Record<string, unknown> | undefined) ?? null,
        interactiveResult: (m.context?.interactiveResult as Record<string, unknown> | undefined) ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  });
}
