/**
 * OpenAPI 3.1 document generated from the Zod schemas (z.toJSONSchema) and
 * served with Swagger UI at /api/docs. Hand-assembled paths — full control,
 * no codegen surprises.
 */
import { z } from "zod";
import {
  AskTutorBody,
  AskTutorResponse,
  CreateGameBody,
  CreateGameResponse,
  CreateGradeBody,
  CreateLearningPathBody,
  CreatePathNodeBody,
  CreateQuestionBody,
  CreateStudentBody,
  CreateStudentResponse,
  CreateSubjectBody,
  ErrorEnvelope,
  GameView,
  GradeView,
  LearnEvidenceResponse,
  LearnProgressResponse,
  LearningPathView,
  LearningPathWithNodesView,
  PatchGameBody,
  PatchGradeBody,
  PatchLearningPathBody,
  PatchPathNodeBody,
  PatchQuestionBody,
  PatchStudentBody,
  PatchSubjectBody,
  PathNodeView,
  PlacementTestResultView,
  PlacementTestSessionView,
  PostLearnEvidenceBody,
  PostLearnEvidenceResponse,
  PostSessionBody,
  PostSessionResponse,
  PutLearnProgressBody,
  PutLearnProgressResponse,
  QuestionView,
  RefineGameBody,
  StartPlacementTestBody,
  StatsResponse,
  StudentView,
  SubjectView,
  SubjectWithPathsView,
  SubmitAnswerBody,
  ToolVerifyBody,
  ToolVerifyResponse,
  TutorConversationResponse,
} from './schemas.js';

function schema(s: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(s, { target: "draft-2020-12" }) as Record<
    string,
    unknown
  >;
  delete json.$schema;
  return json;
}

const bearer = [{ bearerAuth: [] }];
const errRef = { $ref: "#/components/schemas/Error" };
const json = (s: Record<string, unknown> | { $ref: string }) => ({
  "application/json": { schema: s },
});

function op(
  summary: string,
  o: {
    security?: typeof bearer;
    body?: z.ZodType;
    responses: Record<
      string,
      { description: string; content?: ReturnType<typeof json> }
    >;
    params?: string[];
    query?: Record<string, string>;
    tag: string;
  },
) {
  return {
    summary,
    tags: [o.tag],
    ...(o.security ? { security: o.security } : {}),
    ...(o.params
      ? {
          parameters: [
            ...o.params.map((p) => ({
              name: p,
              in: "path",
              required: true,
              schema: { type: "string" },
            })),
            ...Object.entries(o.query ?? {}).map(([name, description]) => ({
              name,
              in: "query",
              required: false,
              description,
              schema: { type: "string" },
            })),
          ],
        }
      : o.query
        ? {
            parameters: Object.entries(o.query).map(([name, description]) => ({
              name,
              in: "query",
              required: false,
              description,
              schema: { type: "string" },
            })),
          }
        : {}),
    ...(o.body
      ? { requestBody: { required: true, content: json(schema(o.body)) } }
      : {}),
    responses: o.responses,
  };
}

export function buildOpenApiDoc(version: string) {
  const ok = (s?: z.ZodType, description = "OK") =>
    s ? { description, content: json(schema(s)) } : { description };
  const fail = (description: string) => ({
    description,
    content: json(errRef),
  });

  return {
    openapi: "3.1.0",
    info: {
      title: "OpenMind Game Studio API",
      version,
      description:
        "Educational game generation API. Device-token auth: POST /api/v1/students returns { studentId, token }; send it as `Authorization: Bearer <token>` on every other call. GameSpecs drive hand-built template shells — the API never serves model-written code.",
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
      schemas: {
        Error: schema(ErrorEnvelope),
        Student: schema(StudentView),
        Game: schema(GameView),
        Grade: schema(GradeView),
        Subject: schema(SubjectView),
        SubjectWithPaths: schema(SubjectWithPathsView),
        LearningPath: schema(LearningPathView),
        LearningPathWithNodes: schema(LearningPathWithNodesView),
        PathNode: schema(PathNodeView),
        Question: schema(QuestionView),
        PlacementTestSession: schema(PlacementTestSessionView),
        PlacementTestResult: schema(PlacementTestResultView),
      },
    },
    paths: {
      "/api/v1/health": {
        get: op(
          "Service health: version, uptime, db status, pipeline metrics",
          {
            tag: "system",
            responses: { "200": { description: "health report" } },
          },
        ),
      },
      "/api/v1/students": {
        post: op(
          "Create a student profile (onboarding) → { studentId, token }",
          {
            tag: "students",
            body: CreateStudentBody,
            responses: {
              "201": ok(CreateStudentResponse, "created"),
              "400": fail("invalid body"),
            },
          },
        ),
      },
      "/api/v1/students/me": {
        get: op("Get my profile", {
          tag: "students",
          security: bearer,
          responses: { "200": ok(StudentView), "401": fail("unauthorized") },
        }),
        patch: op("Update profile (color, interest, language, dailyGoal, …)", {
          tag: "students",
          security: bearer,
          body: PatchStudentBody,
          responses: {
            "200": ok(StudentView),
            "400": fail("invalid body"),
            "401": fail("unauthorized"),
          },
        }),
      },
      "/api/v1/students/me/stats": {
        get: op("XP, streak, daily-goal progress, league", {
          tag: "students",
          security: bearer,
          responses: { "200": ok(StatsResponse), "401": fail("unauthorized") },
        }),
      },
      "/api/v1/students/me/streak-check": {
        post: op("Verify/lapse the streak (call on app open)", {
          tag: "students",
          security: bearer,
          responses: {
            "200": { description: "{ streakCount, lapsed, playedToday }" },
          },
        }),
      },
      "/api/v1/students/me/xp-events": {
        get: op("Recent XP events", {
          tag: "students",
          security: bearer,
          query: { limit: "max items (default 50)" },
          responses: { "200": { description: "{ items: XpEvent[] }" } },
        }),
      },
      "/api/v1/games": {
        post: op(
          "Create a game; returns immediately with { gameId, status: generating, stubSpec } (progressive start) or a clarifying question",
          {
            tag: "games",
            security: bearer,
            body: CreateGameBody,
            responses: {
              "201": ok(CreateGameResponse, "generation started"),
              "200": ok(
                CreateGameResponse,
                "clarifying question — answer and re-POST",
              ),
              "400": fail("invalid body"),
              "422": fail("topic rejected by moderation"),
              "429": fail("rate limited"),
            },
          },
        ),
      },
      "/api/v1/games/library": {
        get: op("Paginated library metadata, sorted by lastPlayedAt", {
          tag: "games",
          security: bearer,
          query: { limit: "page size (≤100)", offset: "offset" },
          responses: {
            "200": { description: "{ items: Game[], total, limit, offset }" },
          },
        }),
      },
      "/api/v1/games/{id}": {
        get: op("Game status + metadata (generating | ready | failed)", {
          tag: "games",
          security: bearer,
          params: ["id"],
          responses: { "200": ok(GameView), "404": fail("not found") },
        }),
        patch: op("Update bestScore / mark played", {
          tag: "games",
          security: bearer,
          params: ["id"],
          body: PatchGameBody,
          responses: { "200": ok(GameView), "404": fail("not found") },
        }),
        delete: op("Soft-delete a game", {
          tag: "games",
          security: bearer,
          params: ["id"],
          responses: {
            "204": { description: "deleted" },
            "404": fail("not found"),
          },
        }),
      },
      "/api/v1/games/{id}/spec": {
        get: op(
          "The GameSpec once ready (202 + Retry-After while generating; 410 if failed)",
          {
            tag: "games",
            security: bearer,
            params: ["id"],
            responses: {
              "200": { description: "the GameSpec JSON" },
              "202": { description: "still generating (Retry-After: 2)" },
              "410": fail("generation failed — POST /retry"),
            },
          },
        ),
      },
      "/api/v1/games/{id}/play": {
        get: op(
          "Fully assembled HTML (ETag = gameId+shellVersion, long Cache-Control)",
          {
            tag: "games",
            security: bearer,
            params: ["id"],
            responses: {
              "200": { description: "text/html — the playable game" },
              "202": { description: "still generating" },
              "304": { description: "not modified (ETag hit)" },
            },
          },
        ),
      },
      "/api/v1/games/{id}/refine": {
        post: op(
          "Refinement: theme swap ($0) / harder / easier ($0 baseline shift) / more_questions (Haiku append)",
          {
            tag: "games",
            security: bearer,
            params: ["id"],
            body: RefineGameBody,
            responses: { "200": ok(GameView), "409": fail("game not ready") },
          },
        ),
      },
      "/api/v1/games/{id}/retry": {
        post: op("Retry a failed generation", {
          tag: "games",
          security: bearer,
          params: ["id"],
          responses: {
            "200": { description: "{ gameId, status }" },
            "409": fail("not failed"),
            "410": fail("params lost — recreate"),
          },
        }),
      },
      "/api/v1/games/{id}/sessions": {
        post: op(
          "Record a play session (reportSummary payload) → XP, streak, enriched feedback",
          {
            tag: "games",
            security: bearer,
            params: ["id"],
            body: PostSessionBody,
            responses: {
              "201": ok(PostSessionResponse, "recorded"),
              "404": fail("not found"),
            },
          },
        ),
      },
      "/api/v1/review/today": {
        get: op(
          "Synthesized Review GameSpec from recently missed items ($0, spaced repetition)",
          {
            tag: "review",
            security: bearer,
            responses: {
              "200": { description: "a goal_shootout GameSpec" },
              "404": fail("not enough data yet"),
            },
          },
        ),
      },
      "/api/v1/review/sessions": {
        post: op(
          "Record a review play session (counts toward streak/daily goal; no game row)",
          {
            tag: "review",
            security: bearer,
            body: PostSessionBody,
            responses: { "201": ok(PostSessionResponse, "recorded") },
          },
        ),
      },

      // ─── Curriculum graph: Grade → Subject → LearningPath → PathNode ────────
      "/api/v1/curriculum/grades": {
        post: op("Create a grade (name + 1..6 index)", {
          tag: "curriculum",
          security: bearer,
          body: CreateGradeBody,
          responses: {
            "201": ok(GradeView, "created"),
            "400": fail("invalid body"),
            "409": fail("index already exists"),
          },
        }),
        get: op("List all grades ordered by index", {
          tag: "curriculum",
          security: bearer,
          responses: { "200": { description: "{ items: Grade[], total }" } },
        }),
      },
      "/api/v1/curriculum/grades/{id}": {
        get: op("Get a grade", {
          tag: "curriculum",
          security: bearer,
          params: ["id"],
          responses: { "200": ok(GradeView), "404": fail("not found") },
        }),
        patch: op("Update a grade name/index", {
          tag: "curriculum",
          security: bearer,
          params: ["id"],
          body: PatchGradeBody,
          responses: {
            "200": ok(GradeView),
            "404": fail("not found"),
            "409": fail("index conflict"),
          },
        }),
        delete: op("Delete a grade (cascades to its subjects, paths, nodes)", {
          tag: "curriculum",
          security: bearer,
          params: ["id"],
          responses: {
            "204": { description: "deleted" },
            "404": fail("not found"),
          },
        }),
      },
      "/api/v1/curriculum/grades/{id}/subjects": {
        get: op("List the subjects under a grade (ordered by orderIndex)", {
          tag: "curriculum",
          security: bearer,
          params: ["id"],
          responses: {
            "200": { description: "{ items: Subject[], total }" },
            "404": fail("grade not found"),
          },
        }),
      },
      "/api/v1/curriculum/subjects": {
        post: op("Create a subject (title, content, orderIndex, gradeId)", {
          tag: "curriculum",
          security: bearer,
          body: CreateSubjectBody,
          responses: {
            "201": ok(SubjectView, "created"),
            "400": fail("invalid body"),
            "404": fail("grade not found"),
          },
        }),
      },
      "/api/v1/curriculum/subjects/{id}": {
        get: op("Get a subject; ?withPaths=true nests its learning paths", {
          tag: "curriculum",
          security: bearer,
          params: ["id"],
          query: { withPaths: "1 to include nested learningPaths" },
          responses: {
            "200": { description: "Subject or SubjectWithPaths" },
            "404": fail("not found"),
          },
        }),
        patch: op("Update a subject title/content/orderIndex", {
          tag: "curriculum",
          security: bearer,
          params: ["id"],
          body: PatchSubjectBody,
          responses: { "200": ok(SubjectView), "404": fail("not found") },
        }),
        delete: op(
          "Delete a subject (cascades to its learning paths + nodes)",
          {
            tag: "curriculum",
            security: bearer,
            params: ["id"],
            responses: {
              "204": { description: "deleted" },
              "404": fail("not found"),
            },
          },
        ),
      },
      "/api/v1/curriculum/learning-paths": {
        post: op("Create a learning path (name, description, subjectId)", {
          tag: "curriculum",
          security: bearer,
          body: CreateLearningPathBody,
          responses: {
            "201": ok(LearningPathView, "created"),
            "400": fail("invalid body"),
            "404": fail("subject not found"),
          },
        }),
      },
      "/api/v1/curriculum/learning-paths/{id}": {
        get: op(
          "Get a learning path; ?withNodes=true nests its path nodes (ordered)",
          {
            tag: "curriculum",
            security: bearer,
            params: ["id"],
            query: { withNodes: "1 to include nested pathNodes" },
            responses: {
              "200": { description: "LearningPath or LearningPathWithNodes" },
              "404": fail("not found"),
            },
          },
        ),
        patch: op("Update a learning path name/description", {
          tag: "curriculum",
          security: bearer,
          params: ["id"],
          body: PatchLearningPathBody,
          responses: { "200": ok(LearningPathView), "404": fail("not found") },
        }),
        delete: op("Delete a learning path (cascades to its path nodes)", {
          tag: "curriculum",
          security: bearer,
          params: ["id"],
          responses: {
            "204": { description: "deleted" },
            "404": fail("not found"),
          },
        }),
      },
      "/api/v1/curriculum/path-nodes": {
        post: op(
          "Create a path node (title, subject, topic, orderIndex, xpReward, learningPathId)",
          {
            tag: "curriculum",
            security: bearer,
            body: CreatePathNodeBody,
            responses: {
              "201": ok(PathNodeView, "created"),
              "400": fail("invalid body"),
              "404": fail("learning path not found"),
            },
          },
        ),
      },
      "/api/v1/curriculum/path-nodes/{id}": {
        get: op("Get a path node", {
          tag: "curriculum",
          security: bearer,
          params: ["id"],
          responses: { "200": ok(PathNodeView), "404": fail("not found") },
        }),
        patch: op(
          "Update a path node title/subject/topic/orderIndex/xpReward",
          {
            tag: "curriculum",
            security: bearer,
            params: ["id"],
            body: PatchPathNodeBody,
            responses: { "200": ok(PathNodeView), "404": fail("not found") },
          },
        ),
        delete: op("Delete a path node", {
          tag: "curriculum",
          security: bearer,
          params: ["id"],
          responses: {
            "204": { description: "deleted" },
            "404": fail("not found"),
          },
        }),
      },
      "/api/v1/curriculum/learning-paths/{id}/questions": {
        post: op(
          "Add a question to a learning path bank (type: choice|drag_drop|spin|connect)",
          {
            tag: "curriculum",
            security: bearer,
            params: ["id"],
            body: CreateQuestionBody,
            responses: {
              "201": ok(QuestionView, "created"),
              "400": fail("invalid body"),
              "404": fail("learning path not found"),
            },
          },
        ),
        get: op(
          "List questions in a learning path bank (?difficulty=easy|medium|hard)",
          {
            tag: "curriculum",
            security: bearer,
            params: ["id"],
            query: { difficulty: "filter by difficulty" },
            responses: {
              "200": { description: "{ items: Question[], total }" },
            },
          },
        ),
      },
      "/api/v1/curriculum/questions/{id}": {
        get: op("Get a question", {
          tag: "curriculum",
          security: bearer,
          params: ["id"],
          responses: { "200": ok(QuestionView), "404": fail("not found") },
        }),
        patch: op("Update a question difficulty/content/linkedNodeId", {
          tag: "curriculum",
          security: bearer,
          params: ["id"],
          body: PatchQuestionBody,
          responses: { "200": ok(QuestionView), "404": fail("not found") },
        }),
        delete: op("Delete a question", {
          tag: "curriculum",
          security: bearer,
          params: ["id"],
          responses: {
            "204": { description: "deleted" },
            "404": fail("not found"),
          },
        }),
      },
      // ─── Placement tests ────────────────────────────────────────────────
      "/api/v1/placement-tests": {
        post: op(
          "Start (or resume) an adaptive placement test — returns the first question",
          {
            tag: "placement-tests",
            security: bearer,
            body: StartPlacementTestBody,
            responses: {
              "201": { description: "{ session, question, progress }" },
              "404": fail("learning path not found"),
              "409": fail("no questions in bank"),
            },
          },
        ),
      },
      "/api/v1/placement-tests/themes": {
        get: op("List the three placement-test themes (جسر / طريق / خريطة)", {
          tag: "placement-tests",
          security: bearer,
          responses: { "200": { description: "{ items: [{ id, en, ar }] }" } },
        }),
      },
      "/api/v1/placement-tests/me": {
        get: op("List the student placement-test history", {
          tag: "placement-tests",
          security: bearer,
          responses: {
            "200": { description: "{ items: PlacementTestSession[], total }" },
          },
        }),
      },
      "/api/v1/placement-tests/{id}": {
        get: op("Get a placement-test session status", {
          tag: "placement-tests",
          security: bearer,
          params: ["id"],
          responses: {
            "200": ok(PlacementTestSessionView),
            "404": fail("not found"),
          },
        }),
      },
      "/api/v1/placement-tests/{id}/answer": {
        post: op(
          "Submit an answer → { correct, nextQuestion, progress, session } (test auto-completes after 10Q)",
          {
            tag: "placement-tests",
            security: bearer,
            params: ["id"],
            body: SubmitAnswerBody,
            responses: {
              "200": {
                description:
                  "{ correct, explanation?, nextQuestion, progress, session }",
              },
              "404": fail("not found"),
              "409": fail("already completed / already answered"),
            },
          },
        ),
      },
      "/api/v1/placement-tests/{id}/result": {
        get: op(
          "Final result: mastery ratio + placed path node + per-answer breakdown",
          {
            tag: "placement-tests",
            security: bearer,
            params: ["id"],
            responses: {
              "200": ok(PlacementTestResultView),
              "404": fail("not found"),
              "409": fail("not completed yet"),
            },
          },
        ),
      },
      "/api/v1/placement-tests/{id}/abandon": {
        post: op("Abandon an in-progress placement test", {
          tag: "placement-tests",
          security: bearer,
          params: ["id"],
          responses: {
            "200": ok(PlacementTestSessionView),
            "404": fail("not found"),
            "409": fail("not in progress"),
          },
        }),
      },
      '/api/v1/tutor/messages': {
        post: op('Ask OpenMind: student question + optional learning context and/or interactiveResult → structured tutor reply, optionally carrying an approved interactivePayload block (Ask → See → Try)', {
          tag: 'tutor', security: bearer, body: AskTutorBody,
          responses: {
            '201': ok(AskTutorResponse, 'tutor reply'),
            '400': fail('invalid body'), '422': fail('question rejected by moderation'),
            '429': fail('rate limited'), '502': fail('tutor temporarily unavailable'),
          },
        }),
      },
      '/api/v1/tutor/conversations/{id}': {
        get: op('Messages of one tutor conversation, oldest first', {
          tag: 'tutor', security: bearer, params: ['id'],
          responses: { '200': ok(TutorConversationResponse), '401': fail('unauthorized') },
        }),
      },
      '/api/v1/learn/progress': {
        get: op('Completed middle-school learning experiences of the authenticated student', {
          tag: 'learn', security: bearer,
          responses: { '200': ok(LearnProgressResponse), '401': fail('unauthorized') },
        }),
        put: op('Mark one learning experience completed (idempotent upsert)', {
          tag: 'learn', security: bearer, body: PutLearnProgressBody,
          responses: {
            '201': ok(PutLearnProgressResponse, 'newly completed'),
            '200': ok(PutLearnProgressResponse, 'already completed — original timestamp kept'),
            '400': fail('invalid body'), '401': fail('unauthorized'),
          },
        }),
      },
      '/api/v1/learn/evidence': {
        get: op('The authenticated student\'s learning-evidence log (per-skill readiness signal), oldest first; optional ?since=ISO', {
          tag: 'learn', security: bearer,
          responses: { '200': ok(LearnEvidenceResponse), '401': fail('unauthorized') },
        }),
        post: op('Append learning-evidence events (idempotent batch, deduped by client-generated id)', {
          tag: 'learn', security: bearer, body: PostLearnEvidenceBody,
          responses: {
            '201': ok(PostLearnEvidenceResponse, 'accepted count + new total'),
            '400': fail('invalid body'), '401': fail('unauthorized'),
          },
        }),
      },
      '/api/v1/tools/{toolId}/verify': {
        post: op('Stateless verification of one interactive-tool attempt (data + answer) using the same ToolDescriptor.verifyResult the tutor trusts — used by lesson-experience widgets, which otherwise grade client-side only', {
          tag: 'tools', security: bearer, params: ['toolId'], body: ToolVerifyBody,
          responses: {
            '200': ok(ToolVerifyResponse),
            '400': fail('invalid body or data not renderable for this tool'),
            '401': fail('unauthorized'), '404': fail('unknown or unavailable tool'), '429': fail('rate limited'),
          },
        }),
      },
    },
  };
}
