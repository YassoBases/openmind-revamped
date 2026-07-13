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
import type { TutorProvider } from '../pipeline/provider.js';
import { AskTutorBody } from '../schemas.js';
import { validateInteractivePayload } from '../tutor/contract.js';
import { assessInteractiveResult } from '../tutor/result.js';
import { TOOL_REGISTRY, eligibleTools, subjectFromLabel } from '../tutor/tools/registry.js';
import type { Store } from '../store/types.js';

/** How many prior turns ride along as conversation memory. */
const HISTORY_TURNS = 12;

/**
 * How far back the result-integrity gate looks for the offered block
 * instance it must verify against (wider than the LLM window so a slow
 * learner's block is still matchable).
 */
const RESULT_WINDOW = 40;

// Only the narrow tutorReply seam is needed here — the full ContentProvider
// satisfies it, and so does a dedicated tutor-only provider (llm/qwen.ts).
export async function tutorRoutes(app: FastifyInstance, opts: { store: Store; provider: TutorProvider }) {
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
    // One fetch serves both consumers: the LLM's conversation memory and the
    // result-integrity gate's source-of-truth thread.
    const recentMessages = body.conversationId
      ? await store.listTutorMessages(student.id, conversationId, RESULT_WINDOW)
      : [];
    const history = recentMessages.slice(-HISTORY_TURNS).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Interaction Result Integrity (tutor/result.ts): a submitted result must
    // match a real, still-open block instance in THIS thread; when the
    // structured answer is present its outcome is recomputed server-side and
    // a wrong claim is overridden. Rejected results are stripped — the
    // message still becomes a normal turn, the tutor still answers the text —
    // and every submission leaves one structured learning signal.
    let interactiveResult = body.interactiveResult ?? null;
    let learningSignal = null;
    // Whether this block instance can accept another attempt (drives the
    // client's freeze/retry state; echoed in the response assessment).
    let interactiveClosed = true;
    if (body.interactiveResult) {
      const assessed = assessInteractiveResult(body.interactiveResult, recentMessages, {
        subjectLabel: body.context?.subject,
        concept: body.context?.concept,
        skills: body.context?.skills,
      });
      interactiveResult = assessed.result;
      learningSignal = assessed.signal;
      interactiveClosed = assessed.closed;
      if (!assessed.result) {
        req.log.warn(
          { type: body.interactiveResult.blockType, reason: assessed.signal.rejectReason },
          '[tutor] interactive result rejected',
        );
        metrics.bump(`tutor_result_rejected:${assessed.signal.rejectReason}`);
      } else if (assessed.signal.verification === 'server_verified') {
        metrics.bump('tutor_result_verified');
        if (assessed.signal.claimedOutcome) {
          req.log.warn(
            {
              type: body.interactiveResult.blockType,
              claimed: assessed.signal.claimedOutcome,
              verified: assessed.signal.outcome,
            },
            '[tutor] client-claimed outcome overridden by server verification',
          );
          metrics.bump('tutor_result_corrected');
        }
      } else {
        metrics.bump('tutor_result_client_reported');
      }
    }

    // Server-side tool eligibility (hard gate, INTERACTIVE_PLATFORM.md §4):
    // the model may only select interactive tools from this list, filtered by
    // the AUTHENTICATED grade + stage, the context's subject when we recognize
    // one, and per-tool availability. Re-checked on the way out below.
    const stage = stageForGrade(student.grade);
    const availableTools = eligibleTools({
      grade: student.grade,
      stage,
      subject: subjectFromLabel(body.context?.subject),
    }).map((t) => t.id);

    let result;
    try {
      result = await provider.tutorReply({
        // Identity comes from the authenticated row — never from the client.
        // stage is resolved server-side so the tutor always teaches for the
        // learner's true educational stage.
        student: {
          name: student.name,
          grade: student.grade,
          stage,
          language: student.language,
          interest: student.interest,
          learningContext: student.learningContext,
        },
        question: body.question,
        context: body.context ?? null,
        availableTools,
        // Post-gate result: verified/corrected, or null when rejected — the
        // model never sees an unmatched or tampered submission as a success.
        interactiveResult,
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
    // Eligibility is re-checked here too — a tool the server never offered
    // this learner can not come back through the model.
    if (result.data.interactivePayload) {
      const offered = result.data.interactivePayload;
      const valid = validateInteractivePayload(offered);
      if (valid && !availableTools.includes(valid.type)) {
        req.log.warn({ type: valid.type }, '[tutor] ineligible interactive payload dropped');
        metrics.bump('tutor_interactive_ineligible');
        result.data.interactivePayload = null;
      } else if (valid) {
        metrics.bump('tutor_interactive_offered');
        metrics.bump(`tutor_interactive_offered:${valid.type}`);
        result.data.interactivePayload = valid;
      } else {
        req.log.warn({ type: offered.type }, '[tutor] invalid interactive payload dropped');
        metrics.bump('tutor_interactive_invalid');
        result.data.interactivePayload = null;
      }
    }
    if (body.interactiveResult) metrics.bump('tutor_interactive_result');

    // Honest-fallback signal (Ask → See → Try growth loop): the model wanted an
    // interaction none of the registered tools can render. This never reaches
    // the student as an activity — the reply text carries the explanation — but
    // it is logged and counted so the team can prioritize the next renderer by
    // real demand. A wish is redundant when a real block already shipped, so we
    // drop it; a wish whose mechanic maps to no available tool is the genuine
    // gap the platform should grow to fill.
    if (result.data.suggestedInteraction) {
      if (result.data.interactivePayload) {
        result.data.suggestedInteraction = null;
      } else {
        const wish = result.data.suggestedInteraction;
        const known = TOOL_REGISTRY.some((t) => t.available && t.primitive === wish.mechanic);
        req.log.info(
          { mechanic: wish.mechanic, known, conceptFamily: wish.conceptFamily, subject: body.context?.subject },
          '[tutor] interaction gap suggested',
        );
        metrics.bump('tutor_interaction_suggested');
        metrics.bump(`tutor_interaction_suggested:${wish.mechanic}`);
        if (!known) metrics.bump(`tutor_interaction_gap:${wish.mechanic}`);
      }
    }

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
        // Only a gate-approved result is persisted as this instance's answer
        // (a rejected one must not close the block or restore as a second
        // attempt); the learning signal is stored for EVERY submission,
        // including rejections — that is the audit trail.
        context: body.context || body.interactiveResult
          ? {
              ...((body.context as Record<string, unknown> | undefined) ?? {}),
              ...(interactiveResult ? { interactiveResult } : {}),
              ...(learningSignal ? { learningSignal } : {}),
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

    // Bridge a server-verified block result into the per-skill evidence log,
    // so the tutor path feeds the same readiness/diagnostics as lessons. The
    // server owns this row (source tutor_block); the client picks it up on its
    // next evidence sync. Best-effort — never fails the reply.
    if (learningSignal?.verification === 'server_verified' && learningSignal.skillId) {
      try {
        await store.upsertLearnEvidence(student.id, [
          {
            id: randomUUID(),
            skillId: learningSignal.skillId,
            representation: learningSignal.representation ?? 'manipulative',
            // The tutor context carries no lens id today; left null.
            context: null,
            source: 'tutor_block',
            kind: 'construction',
            outcome: learningSignal.outcome ?? 'explored',
            verification: 'server_verified',
            attempt: learningSignal.attempt,
            hints: 0,
            recovered: learningSignal.recovered ?? false,
            errorPattern: learningSignal.errorPattern ?? null,
            toolId: learningSignal.tool,
            pathId: body.context?.pathId ?? null,
            experienceId: body.context?.experienceId ?? null,
            stepIndex: null,
            ms: null,
            createdAt: new Date(),
          },
        ]);
      } catch (err) {
        req.log.warn(err, '[tutor] failed to record block evidence');
      }
    }

    // When a result rode this message, echo the server's verdict so the
    // client can freeze a completed block or keep it open for a retry. Never
    // more than the signal already persisted — no instance data leaks here.
    const assessment = body.interactiveResult && learningSignal
      ? {
          verification: learningSignal.verification,
          outcome: learningSignal.outcome,
          attempt: learningSignal.attempt,
          recovered: learningSignal.recovered ?? false,
          closed: interactiveClosed,
          ...(learningSignal.rejectReason ? { rejectReason: learningSignal.rejectReason } : {}),
        }
      : null;

    return reply.code(201).send({
      conversationId,
      reply: result.data,
      model: result.model,
      ...(assessment ? { assessment } : {}),
    });
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
