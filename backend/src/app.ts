/**
 * Fastify app assembly (separated from server.ts so tests can inject()).
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config.js';
import { buildOpenApiDoc } from './openapi.js';
import { metrics } from './pipeline/metrics.js';
import type { ContentProvider } from './pipeline/provider.js';
import { gameRoutes } from './routes/games.js';
import { worldRoutes } from './routes/worlds.js';
import { learnRoutes } from './routes/learn.js';
import { reviewRoutes } from './routes/review.js';
import { statsRoutes } from './routes/stats.js';
import { studentRoutes } from './routes/students.js';
import { toolsRoutes } from './routes/tools.js';
import { tutorRoutes } from './routes/tutor.js';
import { curriculumRoutes } from './routes/curriculum.js';
import { placementTestRoutes } from './routes/placementTests.js';
import type { Store } from './store/types.js';

export const VERSION = "4.0.0";
const startedAt = Date.now();

export async function buildApp(deps: {
  store: Store;
  provider: ContentProvider;
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        process.env.NODE_ENV === "production"
          ? undefined
          : { target: "pino-pretty" },
    },
  });

  await app.register(cors, {
    origin: config.corsOrigins === true ? true : String(config.corsOrigins).split(','),
    // The web client uses PATCH (profile/lens) and PUT (learn progress);
    // without listing them the preflight fails with net::ERR_FAILED.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  // Consistent error envelope { error: { code, message, requestId } }.
  app.setErrorHandler((error, req, reply) => {
    const e = error as { statusCode?: number; code?: string; message?: string };
    req.log.error(error);
    reply.code(e.statusCode ?? 500).send({
      error: {
        code: e.code ?? "INTERNAL",
        message: e.message ?? "internal error",
        requestId: req.id,
      },
    });
  });
  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: `no route ${req.method} ${req.url}`,
        requestId: req.id,
      },
    });
  });

  // health — the app's Test Connection button hits this
  app.get("/api/v1/health", async () => ({
    name: "edumind-backend",
    version: VERSION,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    db:
      deps.store.kind === "prisma"
        ? (await deps.store.ping())
          ? "postgres"
          : "down"
        : "memory",
    llm: deps.provider.name,
    mockReason: config.mockReason,
    metrics: metrics.snapshot(),
  }));
  // unversioned alias for quick curl checks
  app.get("/health", async (_req, reply) => reply.redirect("/api/v1/health"));

  // OpenAPI 3.1 + Swagger UI at /api/docs
  await app.register(swagger, {
    mode: "static",
    specification: { document: buildOpenApiDoc(VERSION) as never },
  });
  await app.register(swaggerUi, { routePrefix: "/api/docs" });

  await app.register(studentRoutes, { store: deps.store });
  await app.register(gameRoutes, { store: deps.store, provider: deps.provider });
  await app.register(worldRoutes, { store: deps.store, provider: deps.provider });
  await app.register(reviewRoutes, { store: deps.store, provider: deps.provider });
  await app.register(statsRoutes, { store: deps.store });
  await app.register(tutorRoutes, { store: deps.store, provider: deps.provider });
  await app.register(learnRoutes, { store: deps.store });
  await app.register(toolsRoutes, { store: deps.store });
  await app.register(curriculumRoutes, { store: deps.store });
  await app.register(placementTestRoutes, { store: deps.store });
  return app;
}
