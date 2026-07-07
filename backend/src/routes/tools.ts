/**
 * Stateless interactive-tool verification — the piece lesson experiences are
 * missing today (they currently grade 100% client-side, see learn/widgets).
 * This route is a second consumer of the exact same ToolDescriptor.verifyResult
 * already trusted by tutor/result.ts, so Ask Hudhud and lesson experiences
 * share one grading truth for every tool, never two.
 *
 * Trust model (deliberately weaker than the tutor path — documented, not
 * hidden): Ask Hudhud's verification is tamper-proof because the server
 * persisted the puzzle instance itself and matches a submission against that
 * stored thread. Lesson-catalog content is bundled client-side, so this route
 * necessarily receives BOTH the instance `data` and the learner's `answer`
 * from the same untrusted client — it catches an honest client's bugs and
 * guarantees identical grading logic across surfaces, but it cannot detect a
 * client that fabricates both fields in agreement. That is still strictly
 * better than today (triangle_planner has no server check at all); true
 * tamper-proofing would require the backend to hold canonical catalog
 * content, a materially bigger change.
 */
import type { FastifyInstance } from 'fastify';
import { makeAuthHook } from '../auth.js';
import { config } from '../config.js';
import { ToolVerifyBody } from '../schemas.js';
import { emptyToolData, getTool } from '../tutor/tools/registry.js';
import type { ToolDataView } from '../tutor/tools/types.js';
import type { Store } from '../store/types.js';

export async function toolsRoutes(app: FastifyInstance, opts: { store: Store }) {
  const auth = makeAuthHook(opts.store);

  // Same in-process per-student rate-limit pattern as tutor/messages — cheap
  // pure computation, but still budgeted, not open-ended.
  const callTimestamps = new Map<string, number[]>();

  app.post<{ Params: { toolId: string } }>(
    '/api/v1/tools/:toolId/verify',
    { preHandler: auth },
    async (req, reply) => {
      const student = req.student!;
      const now = Date.now();
      const stamps = (callTimestamps.get(student.id) ?? []).filter((t) => now - t < 60_000);
      if (stamps.length >= config.maxToolVerifyPerMinute) {
        return reply.code(429).send({
          error: { code: 'RATE_LIMITED', message: 'too many verification checks — slow down a moment', requestId: req.id },
        });
      }
      stamps.push(now);
      callTimestamps.set(student.id, stamps);

      const tool = getTool(req.params.toolId);
      if (!tool || !tool.available) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: `no tool "${req.params.toolId}"`, requestId: req.id },
        });
      }

      const parsed = ToolVerifyBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid body', requestId: req.id },
        });
      }

      const fullData = { ...emptyToolData(), ...parsed.data.data } as ToolDataView;
      if (!tool.validate(fullData)) {
        return reply.code(400).send({
          error: { code: 'INVALID_DATA', message: 'data is not a renderable instance of this tool', requestId: req.id },
        });
      }

      const verdict = tool.verifyResult(fullData, parsed.data.answer);

      // Diagnose a non-correct, verifiable outcome so the client can offer a
      // pattern-specific support action instead of a generic "try again".
      const errorPattern =
        (verdict === 'incorrect' || verdict === 'partially_correct') && tool.diagnoseError
          ? (tool.diagnoseError(fullData, parsed.data.answer) ?? null)
          : null;

      // Opt-in persistence: record the graded attempt as evidence. The server
      // fills outcome/verification/errorPattern from ITS verdict (the client
      // cannot forge those); a non-real verdict (invalid/unverifiable) is not
      // worth recording. Best-effort — a store hiccup never fails the check.
      const ev = parsed.data.evidence;
      if (ev && (verdict === 'correct' || verdict === 'partially_correct' || verdict === 'incorrect' || verdict === 'explored')) {
        try {
          await opts.store.upsertLearnEvidence(student.id, [
            {
              id: ev.eventId,
              skillId: ev.skillId,
              representation: ev.representation,
              context: ev.context ?? null,
              source: 'tool_verify',
              kind: ev.kind,
              outcome: verdict,
              verification: 'server_verified',
              attempt: ev.attempt ?? 1,
              hints: ev.hints ?? 0,
              recovered: false,
              errorPattern,
              toolId: tool.id,
              pathId: ev.pathId ?? null,
              experienceId: ev.experienceId ?? null,
              stepIndex: ev.stepIndex ?? null,
              ms: ev.ms ?? null,
              createdAt: new Date(),
            },
          ]);
        } catch {
          /* evidence is best-effort; the verdict still returns */
        }
      }

      return { verdict, errorPattern };
    },
  );
}
