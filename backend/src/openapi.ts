/**
 * OpenAPI 3.1 document generated from the Zod schemas (z.toJSONSchema) and
 * served with Swagger UI at /api/docs. Hand-assembled paths — full control,
 * no codegen surprises.
 */
import { z } from 'zod';
import {
  CreateGameBody,
  CreateGameResponse,
  CreateStudentBody,
  CreateStudentResponse,
  ErrorEnvelope,
  GameView,
  PatchGameBody,
  PatchStudentBody,
  PostSessionBody,
  PostSessionResponse,
  RefineGameBody,
  StatsResponse,
  StudentView,
} from './schemas.js';

function schema(s: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(s, { target: 'draft-2020-12' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

const bearer = [{ bearerAuth: [] }];
const errRef = { $ref: '#/components/schemas/Error' };
const json = (s: Record<string, unknown> | { $ref: string }) => ({
  'application/json': { schema: s },
});

function op(
  summary: string,
  o: {
    security?: typeof bearer;
    body?: z.ZodType;
    responses: Record<string, { description: string; content?: ReturnType<typeof json> }>;
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
            ...o.params.map((p) => ({ name: p, in: 'path', required: true, schema: { type: 'string' } })),
            ...Object.entries(o.query ?? {}).map(([name, description]) => ({
              name, in: 'query', required: false, description, schema: { type: 'string' },
            })),
          ],
        }
      : o.query
        ? {
            parameters: Object.entries(o.query).map(([name, description]) => ({
              name, in: 'query', required: false, description, schema: { type: 'string' },
            })),
          }
        : {}),
    ...(o.body ? { requestBody: { required: true, content: json(schema(o.body)) } } : {}),
    responses: o.responses,
  };
}

export function buildOpenApiDoc(version: string) {
  const ok = (s?: z.ZodType, description = 'OK') =>
    s ? { description, content: json(schema(s)) } : { description };
  const fail = (description: string) => ({ description, content: json(errRef) });

  return {
    openapi: '3.1.0',
    info: {
      title: 'OpenMind Game Studio API',
      version,
      description:
        'Educational game generation API. Device-token auth: POST /api/v1/students returns { studentId, token }; send it as `Authorization: Bearer <token>` on every other call. GameSpecs drive hand-built template shells — the API never serves model-written code.',
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
      schemas: {
        Error: schema(ErrorEnvelope),
        Student: schema(StudentView),
        Game: schema(GameView),
      },
    },
    paths: {
      '/api/v1/health': {
        get: op('Service health: version, uptime, db status, pipeline metrics', {
          tag: 'system',
          responses: { '200': { description: 'health report' } },
        }),
      },
      '/api/v1/students': {
        post: op('Create a student profile (onboarding) → { studentId, token }', {
          tag: 'students',
          body: CreateStudentBody,
          responses: { '201': ok(CreateStudentResponse, 'created'), '400': fail('invalid body') },
        }),
      },
      '/api/v1/students/me': {
        get: op('Get my profile', {
          tag: 'students', security: bearer,
          responses: { '200': ok(StudentView), '401': fail('unauthorized') },
        }),
        patch: op('Update profile (color, interest, language, dailyGoal, …)', {
          tag: 'students', security: bearer, body: PatchStudentBody,
          responses: { '200': ok(StudentView), '400': fail('invalid body'), '401': fail('unauthorized') },
        }),
      },
      '/api/v1/students/me/stats': {
        get: op('XP, streak, daily-goal progress, league', {
          tag: 'students', security: bearer,
          responses: { '200': ok(StatsResponse), '401': fail('unauthorized') },
        }),
      },
      '/api/v1/students/me/streak-check': {
        post: op('Verify/lapse the streak (call on app open)', {
          tag: 'students', security: bearer,
          responses: { '200': { description: '{ streakCount, lapsed, playedToday }' } },
        }),
      },
      '/api/v1/students/me/xp-events': {
        get: op('Recent XP events', {
          tag: 'students', security: bearer, query: { limit: 'max items (default 50)' },
          responses: { '200': { description: '{ items: XpEvent[] }' } },
        }),
      },
      '/api/v1/games': {
        post: op('Create a game; returns immediately with { gameId, status: generating, stubSpec } (progressive start) or a clarifying question', {
          tag: 'games', security: bearer, body: CreateGameBody,
          responses: {
            '201': ok(CreateGameResponse, 'generation started'),
            '200': ok(CreateGameResponse, 'clarifying question — answer and re-POST'),
            '400': fail('invalid body'), '422': fail('topic rejected by moderation'), '429': fail('rate limited'),
          },
        }),
      },
      '/api/v1/games/library': {
        get: op('Paginated library metadata, sorted by lastPlayedAt', {
          tag: 'games', security: bearer, query: { limit: 'page size (≤100)', offset: 'offset' },
          responses: { '200': { description: '{ items: Game[], total, limit, offset }' } },
        }),
      },
      '/api/v1/games/{id}': {
        get: op('Game status + metadata (generating | ready | failed)', {
          tag: 'games', security: bearer, params: ['id'],
          responses: { '200': ok(GameView), '404': fail('not found') },
        }),
        patch: op('Update bestScore / mark played', {
          tag: 'games', security: bearer, params: ['id'], body: PatchGameBody,
          responses: { '200': ok(GameView), '404': fail('not found') },
        }),
        delete: op('Soft-delete a game', {
          tag: 'games', security: bearer, params: ['id'],
          responses: { '204': { description: 'deleted' }, '404': fail('not found') },
        }),
      },
      '/api/v1/games/{id}/spec': {
        get: op('The GameSpec once ready (202 + Retry-After while generating; 410 if failed)', {
          tag: 'games', security: bearer, params: ['id'],
          responses: {
            '200': { description: 'the GameSpec JSON' },
            '202': { description: 'still generating (Retry-After: 2)' },
            '410': fail('generation failed — POST /retry'),
          },
        }),
      },
      '/api/v1/games/{id}/play': {
        get: op('Fully assembled HTML (ETag = gameId+shellVersion, long Cache-Control)', {
          tag: 'games', security: bearer, params: ['id'],
          responses: {
            '200': { description: 'text/html — the playable game' },
            '202': { description: 'still generating' },
            '304': { description: 'not modified (ETag hit)' },
          },
        }),
      },
      '/api/v1/games/{id}/refine': {
        post: op('Refinement: theme swap ($0) / harder / easier ($0 baseline shift) / more_questions (Haiku append)', {
          tag: 'games', security: bearer, params: ['id'], body: RefineGameBody,
          responses: { '200': ok(GameView), '409': fail('game not ready') },
        }),
      },
      '/api/v1/games/{id}/retry': {
        post: op('Retry a failed generation', {
          tag: 'games', security: bearer, params: ['id'],
          responses: { '200': { description: '{ gameId, status }' }, '409': fail('not failed'), '410': fail('params lost — recreate') },
        }),
      },
      '/api/v1/games/{id}/sessions': {
        post: op('Record a play session (reportSummary payload) → XP, streak, enriched feedback', {
          tag: 'games', security: bearer, params: ['id'], body: PostSessionBody,
          responses: { '201': ok(PostSessionResponse, 'recorded'), '404': fail('not found') },
        }),
      },
      '/api/v1/review/today': {
        get: op('Synthesized Review GameSpec from recently missed items ($0, spaced repetition)', {
          tag: 'review', security: bearer,
          responses: { '200': { description: 'a goal_shootout GameSpec' }, '404': fail('not enough data yet') },
        }),
      },
      '/api/v1/review/sessions': {
        post: op('Record a review play session (counts toward streak/daily goal; no game row)', {
          tag: 'review', security: bearer, body: PostSessionBody,
          responses: { '201': ok(PostSessionResponse, 'recorded') },
        }),
      },
    },
  };
}
