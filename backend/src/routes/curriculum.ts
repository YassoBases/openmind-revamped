/**
 * /api/v1/curriculum/* — the Grade → Subject → LearningPath → PathNode graph.
 *
 * These endpoints are read-mostly (the curriculum is authored ahead of time),
 * but full CRUD is exposed so an admin tool can edit it. Reads support a
 * read-through mode that nests children (e.g. GET a grade returns its subjects,
 * GET a subject returns its learning paths, GET a learning path returns its
 * nodes) so a client can hydrate a whole tree in one call.
 *
 * Auth: every route requires a valid student bearer token (same hook as the
 * rest of the API). There is no separate "admin" role yet — write access is
 * gated only by possession of a token. Tighten before production.
 */
import type { FastifyInstance } from "fastify";
import { makeAuthHook } from "../auth.js";
import {
  CreateGradeBody,
  CreateQuestionBody,
  CreateLearningPathBody,
  CreatePathNodeBody,
  CreateSubjectBody,
  PatchGradeBody,
  PatchLearningPathBody,
  PatchPathNodeBody,
  PatchSubjectBody,
  PatchQuestionBody,
} from "../schemas.js";
import type {
  GradeRow,
  LearningPathRow,
  PathNodeRow,
  Store,
  SubjectRow,
  QuestionDifficulty,
  QuestionRow,
} from "../store/types.js";

// ─── view mappers (Date → ISO string for the wire) ───────────────────────────

function gradeView(g: GradeRow) {
  return {
    id: g.id,
    name: g.name,
    index: g.index,
    createdAt: g.createdAt.toISOString(),
  };
}
function subjectView(s: SubjectRow) {
  return {
    id: s.id,
    title: s.title,
    content: s.content,
    orderIndex: s.orderIndex,
    gradeId: s.gradeId,
    createdAt: s.createdAt.toISOString(),
  };
}
function learningPathView(lp: LearningPathRow) {
  return {
    id: lp.id,
    name: lp.name,
    description: lp.description,
    subjectId: lp.subjectId,
    createdAt: lp.createdAt.toISOString(),
  };
}
function pathNodeView(pn: PathNodeRow) {
  return {
    id: pn.id,
    title: pn.title,
    subject: pn.subject,
    topic: pn.topic,
    orderIndex: pn.orderIndex,
    xpReward: pn.xpReward,
    depth: pn.depth,
    learningPathId: pn.learningPathId,
    createdAt: pn.createdAt.toISOString(),
  };
}

export async function curriculumRoutes(
  app: FastifyInstance,
  opts: { store: Store },
) {
  const { store } = opts;
  const auth = makeAuthHook(store);

  const err = (
    reply: { code: (n: number) => { send: (b: unknown) => unknown } },
    reqId: string,
    status: number,
    code: string,
    message: string,
  ) => reply.code(status).send({ error: { code, message, requestId: reqId } });

  const parseOr400 = <T>(
    schema: {
      safeParse: (x: unknown) => {
        success: boolean;
        data?: T;
        error?: { issues: { message: string }[] };
      };
    },
    body: unknown,
    reply: { code: (n: number) => { send: (b: unknown) => unknown } },
    reqId: string,
  ): T | null => {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      err(
        reply,
        reqId,
        400,
        "BAD_REQUEST",
        parsed.error!.issues[0]?.message ?? "invalid body",
      );
      return null;
    }
    return parsed.data as T;
  };

    function questionView(q: QuestionRow) {
  return {
    id: q.id,
    learningPathId: q.learningPathId,
    type: q.type,
    difficulty: q.difficulty,
    content: q.content,
    linkedNodeId: q.linkedNodeId,
    createdAt: q.createdAt.toISOString(),
  };
}
  // ════════════════════════════════════════════════════════════════════ Grades
  app.post(
    "/api/v1/curriculum/grades",
    { preHandler: auth },
    async (req, reply) => {
      const body = parseOr400(CreateGradeBody, req.body, reply, req.id);
      if (!body) return;
      try {
        const g = await store.createGrade(body);
        return reply.code(201).send(gradeView(g));
      } catch (e) {
        return err(reply, req.id, 409, "CONFLICT", (e as Error).message);
      }
    },
  );

  app.get("/api/v1/curriculum/grades", { preHandler: auth }, async () => {
    const grades = await store.listGrades();
    return { items: grades.map(gradeView), total: grades.length };
  });

  app.get(
    "/api/v1/curriculum/grades/:id",
    { preHandler: auth },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const g = await store.getGrade(id);
      if (!g) return err(reply, req.id, 404, "NOT_FOUND", "grade not found");
      return gradeView(g);
    },
  );

  app.patch(
    "/api/v1/curriculum/grades/:id",
    { preHandler: auth },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = parseOr400(PatchGradeBody, req.body, reply, req.id);
      if (!body) return;
      try {
        const g = await store.updateGrade(id, body);
        return gradeView(g);
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("not found"))
          return err(reply, req.id, 404, "NOT_FOUND", msg);
        return err(reply, req.id, 409, "CONFLICT", msg);
      }
    },
  );

  app.delete(
    "/api/v1/curriculum/grades/:id",
    { preHandler: auth },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const g = await store.getGrade(id);
      if (!g) return err(reply, req.id, 404, "NOT_FOUND", "grade not found");
      await store.deleteGrade(id);
      return reply.code(204).send();
    },
  );

  // Convenience: grades with their subjects nested (one-call tree hydration).
  app.get(
    "/api/v1/curriculum/grades/:id/subjects",
    { preHandler: auth },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const g = await store.getGrade(id);
      if (!g) return err(reply, req.id, 404, "NOT_FOUND", "grade not found");
      const subjects = await store.listSubjects(id);
      return { items: subjects.map(subjectView), total: subjects.length };
    },
  );

  // ═══════════════════════════════════════════════════════════════════ Subjects
  app.post(
    "/api/v1/curriculum/subjects",
    { preHandler: auth },
    async (req, reply) => {
      const body = parseOr400(CreateSubjectBody, req.body, reply, req.id);
      if (!body) return;
      try {
        const s = await store.createSubject(body);
        return reply.code(201).send(subjectView(s));
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("grade not found"))
          return err(reply, req.id, 404, "NOT_FOUND", msg);
        return err(reply, req.id, 409, "CONFLICT", msg);
      }
    },
  );


app.get('/api/v1/curriculum/subjects/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { withPaths?: string };
    if (q.withPaths === 'true' || q.withPaths === '1') {
      const s = await store.getSubjectWithPaths(id);
      if (!s) return err(reply, req.id, 404, 'NOT_FOUND', 'subject not found');
      return { ...subjectView(s), learningPaths: s.learningPaths.map(learningPathView) };
    }
    const s = await store.getSubject(id);
    if (!s) return err(reply, req.id, 404, 'NOT_FOUND', 'subject not found');
    return subjectView(s);
  });

  app.patch(
    "/api/v1/curriculum/subjects/:id",
    { preHandler: auth },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = parseOr400(PatchSubjectBody, req.body, reply, req.id);
      if (!body) return;
      try {
        const s = await store.updateSubject(id, body);
        return subjectView(s);
      } catch (e) {
        return err(reply, req.id, 404, "NOT_FOUND", (e as Error).message);
      }
    },
  );

  app.delete(
    "/api/v1/curriculum/subjects/:id",
    { preHandler: auth },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const s = await store.getSubject(id);
      if (!s) return err(reply, req.id, 404, "NOT_FOUND", "subject not found");
      await store.deleteSubject(id);
      return reply.code(204).send();
    },
  );

  // ════════════════════════════════════════════════════════════════ LearningPaths
  app.post(
    "/api/v1/curriculum/learning-paths",
    { preHandler: auth },
    async (req, reply) => {
      const body = parseOr400(CreateLearningPathBody, req.body, reply, req.id);
      if (!body) return;
      try {
        const lp = await store.createLearningPath(body);
        return reply.code(201).send(learningPathView(lp));
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("subject not found"))
          return err(reply, req.id, 404, "NOT_FOUND", msg);
        return err(reply, req.id, 409, "CONFLICT", msg);
      }
    },
  );

//   app.get(
//     "/api/v1/curriculum/learning-paths/:id",
//     { preHandler: auth },
//     async (req, reply) => {
//       const { id } = req.params as { id: string };
//       const withNodes = req.query as { withNodes?: string };
//       if (withNodes === "true" || withNodes === "1") {
//         const lp = await store.getLearningPathWithNodes(id);
//         if (!lp)
//           return err(
//             reply,
//             req.id,
//             404,
//             "NOT_FOUND",
//             "learning path not found",
//           );
//         return {
//           ...learningPathView(lp),
//           pathNodes: lp.pathNodes.map(pathNodeView),
//         };
//       }
//       const lp = await store.getLearningPath(id);
//       if (!lp)
//         return err(reply, req.id, 404, "NOT_FOUND", "learning path not found");
//       return learningPathView(lp);
//     },
//   );

app.get('/api/v1/curriculum/learning-paths/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { withNodes?: string };
    if (q.withNodes === 'true' || q.withNodes === '1') {
      const lp = await store.getLearningPathWithNodes(id);
      if (!lp) return err(reply, req.id, 404, 'NOT_FOUND', 'learning path not found');
      return { ...learningPathView(lp), pathNodes: lp.pathNodes.map(pathNodeView) };
    }
    const lp = await store.getLearningPath(id);
    if (!lp) return err(reply, req.id, 404, 'NOT_FOUND', 'learning path not found');
    return learningPathView(lp);
  });
  app.patch(
    "/api/v1/curriculum/learning-paths/:id",
    { preHandler: auth },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = parseOr400(PatchLearningPathBody, req.body, reply, req.id);
      if (!body) return;
      try {
        const lp = await store.updateLearningPath(id, body);
        return learningPathView(lp);
      } catch (e) {
        return err(reply, req.id, 404, "NOT_FOUND", (e as Error).message);
      }
    },
  );

  app.delete(
    "/api/v1/curriculum/learning-paths/:id",
    { preHandler: auth },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const lp = await store.getLearningPath(id);
      if (!lp)
        return err(reply, req.id, 404, "NOT_FOUND", "learning path not found");
      await store.deleteLearningPath(id);
      return reply.code(204).send();
    },
  );

  // ═══════════════════════════════════════════════════════════════════ PathNodes
  app.post(
    "/api/v1/curriculum/path-nodes",
    { preHandler: auth },
    async (req, reply) => {
      const body = parseOr400(CreatePathNodeBody, req.body, reply, req.id);
      if (!body) return;
      try {
        const pn = await store.createPathNode(body);
        return reply.code(201).send(pathNodeView(pn));
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("learning path not found"))
          return err(reply, req.id, 404, "NOT_FOUND", msg);
        return err(reply, req.id, 409, "CONFLICT", msg);
      }
    },
  );

  app.get(
    "/api/v1/curriculum/path-nodes/:id",
    { preHandler: auth },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const pn = await store.getPathNode(id);
      if (!pn)
        return err(reply, req.id, 404, "NOT_FOUND", "path node not found");
      return pathNodeView(pn);
    },
  );

  app.patch(
    "/api/v1/curriculum/path-nodes/:id",
    { preHandler: auth },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = parseOr400(PatchPathNodeBody, req.body, reply, req.id);
      if (!body) return;
      try {
        const pn = await store.updatePathNode(id, body);
        return pathNodeView(pn);
      } catch (e) {
        return err(reply, req.id, 404, "NOT_FOUND", (e as Error).message);
      }
    },
  );

  app.delete(
    "/api/v1/curriculum/path-nodes/:id",
    { preHandler: auth },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const pn = await store.getPathNode(id);
      if (!pn)
        return err(reply, req.id, 404, "NOT_FOUND", "path node not found");
      await store.deletePathNode(id);
      return reply.code(204).send();
    },
  );

   // Each learning path has its own question bank for the placement test.

  app.post('/api/v1/curriculum/learning-paths/:id/questions', { preHandler: auth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const lp = await store.getLearningPath(id);
    if (!lp) return err(reply, req.id, 404, 'NOT_FOUND', 'learning path not found');
    const body = parseOr400(CreateQuestionBody, req.body, reply, req.id);
    if (!body) return;
    // validate linkedNodeId points to a node on this path
    if (body.linkedNodeId) {
      const node = await store.getPathNode(body.linkedNodeId);
      if (!node || node.learningPathId !== id) return err(reply, req.id, 400, 'BAD_REQUEST', 'linkedNodeId must belong to this learning path');
    }
    const q = await store.createQuestion({
      learningPathId: id,
      type: body.type,
      difficulty: body.difficulty,
      content: body.content as Record<string, unknown>,
      linkedNodeId: body.linkedNodeId ?? null,
    });
    return reply.code(201).send(questionView(q));
  });

  app.get('/api/v1/curriculum/learning-paths/:id/questions', { preHandler: auth }, async (req) => {
    const { id } = req.params as { id: string };
    const q = req.query as { difficulty?: string };
    const difficulty = (q.difficulty as QuestionDifficulty | undefined) ?? undefined;
    const questions = await store.listQuestions(id, difficulty);
    return { items: questions.map(questionView), total: questions.length };
  });

  app.get('/api/v1/curriculum/questions/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = await store.getQuestion(id);
    if (!q) return err(reply, req.id, 404, 'NOT_FOUND', 'question not found');
    return questionView(q);
  });

  app.patch('/api/v1/curriculum/questions/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseOr400(PatchQuestionBody, req.body, reply, req.id);
    if (!body) return;
    try {
      const q = await store.updateQuestion(id, {
        ...(body.difficulty ? { difficulty: body.difficulty } : {}),
        ...(body.content ? { content: body.content as Record<string, unknown> } : {}),
        ...(body.linkedNodeId !== undefined ? { linkedNodeId: body.linkedNodeId } : {}),
      });
      return questionView(q);
    } catch (e) {
      return err(reply, req.id, 404, 'NOT_FOUND', (e as Error).message);
    }
  });

  app.delete('/api/v1/curriculum/questions/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = await store.getQuestion(id);
    if (!q) return err(reply, req.id, 404, 'NOT_FOUND', 'question not found');
    await store.deleteQuestion(id);
    return reply.code(204).send();
  });
}
