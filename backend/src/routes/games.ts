/**
 * /api/v1/games — create (progressive start), status, spec, server assembly,
 * library, refine, retry, sessions (summary ingestion + enriched feedback).
 */
import type { FastifyInstance } from 'fastify';
import {
  GENERATABLE_GAME_TYPES,
  THEMES,
  buildStubSpec,
  type GameSpec,
  type GameType,
  type Meta,
  type Student,
} from '@edumind/shared';
import { recordSession } from './session_helper.js';
import { makeAuthHook } from '../auth.js';
import { gameGenGrade } from '../learning/stage.js';
import { config } from '../config.js';
import { moderate } from '../llm/moderation.js';
import { assembleHtml, shellVersionFor } from '../pipeline/assembler.js';
import { generateSpec } from '../pipeline/generator.js';
import { metrics } from '../pipeline/metrics.js';
import type { ContentProvider } from '../pipeline/provider.js';
import { thumbnailFor } from '../pipeline/thumbnails.js';
import { CreateGameBody, PatchGameBody, PostSessionBody, RefineGameBody } from '../schemas.js';
import type { GameRow, Store, StudentRow } from '../store/types.js';

interface JobParams {
  meta: Meta;
  student: Student;
  normalized: { confidence: number; complexity: number; notes?: string | null };
}

// In-flight/retryable job parameters (in-memory; restart → recreate the game).
const jobParams = new Map<string, JobParams>();
const generationTimestamps = new Map<string, number[]>(); // studentId → epoch ms

export function gameView(g: GameRow) {
  return {
    id: g.id,
    gameType: g.gameType,
    theme: g.theme,
    subject: g.subject,
    topic: g.topic,
    language: g.language,
    status: g.status,
    error: g.error,
    shellVersion: g.shellVersion,
    thumbnailUrl: g.thumbnailUrl,
    bestScore: g.bestScore,
    playCount: g.playCount,
    lastPlayedAt: g.lastPlayedAt ? g.lastPlayedAt.toISOString() : null,
    createdAt: g.createdAt.toISOString(),
  };
}

function studentBlock(s: StudentRow): Student {
  return {
    name: s.name,
    gender: (s.gender as 'm' | 'f' | null) ?? null,
    color: s.color,
    ...(s.interest ? { interest: s.interest as Student['interest'] } : {}),
  };
}

export async function gameRoutes(
  app: FastifyInstance,
  opts: { store: Store; provider: ContentProvider },
) {
  const { store, provider } = opts;
  const auth = makeAuthHook(store);
  const err = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }, reqId: string, status: number, code: string, message: string) =>
    reply.code(status).send({ error: { code, message, requestId: reqId } });

  function runGenerationJob(gameId: string, params: JobParams) {
    jobParams.set(gameId, params);
    void (async () => {
      try {
        const result = await generateSpec({ store, provider, log: app.log }, params);
        const thumbnailUrl = await thumbnailFor(params.meta.topic, params.meta.theme, app.log);
        await store.updateGame(gameId, {
          status: 'ready',
          spec: result.spec,
          shellVersion: shellVersionFor(params.meta.gameType),
          thumbnailUrl,
          error: null,
        });
        app.log.info(`[games] ${gameId} ready (cache=${result.fromCache}, model=${result.model})`);
      } catch (e) {
        await store.updateGame(gameId, { status: 'failed', error: (e as Error).message }).catch(() => {});
        app.log.error(`[games] ${gameId} generation failed: ${(e as Error).message}`);
      }
    })();
  }

  // ------------------------------------------------------------- create
  app.post('/api/v1/games', { preHandler: auth }, async (req, reply) => {
    const parsed = CreateGameBody.safeParse(req.body);
    if (!parsed.success) {
      return err(reply, req.id, 400, 'BAD_REQUEST', parsed.error.issues[0]?.message ?? 'invalid body');
    }
    const body = parsed.data;
    const student = req.student!;
    const language = body.language ?? (student.language as 'en' | 'ar');

    if (!(THEMES[body.gameType] as readonly string[]).includes(body.theme)) {
      return err(reply, req.id, 400, 'THEME_INVALID', `theme "${body.theme}" is not valid for ${body.gameType}`);
    }

    // Number City ships curated lessons through the dedicated trail-home
    // entry; the generator learns its scene-kind spec shape in a later phase.
    if (!(GENERATABLE_GAME_TYPES as readonly string[]).includes(body.gameType)) {
      return err(reply, req.id, 400, 'GAME_TYPE_NOT_GENERATABLE',
        `${body.gameType} lessons are curated — they cannot be generated yet`);
    }

    // simple per-student generation rate limit
    const now = Date.now();
    const stamps = (generationTimestamps.get(student.id) ?? []).filter((t) => now - t < 3_600_000);
    if (stamps.length >= config.maxGenerationsPerHour) {
      return err(reply, req.id, 429, 'RATE_LIMITED', 'too many games this hour — replay some favorites!');
    }

    // moderation pre-check on raw inputs
    const mod = await moderate([body.topic, body.subject ?? ''], app.log);
    if (mod.flagged) {
      metrics.bump('moderation_pre_flagged');
      return err(reply, req.id, 422, 'TOPIC_REJECTED', 'that topic cannot be turned into a lesson');
    }

    // normalize (may ask ONE clarifying question instead of creating a game)
    const normalized = await provider.normalize({
      subject: body.subject,
      topic: body.topic,
      language,
      grade: gameGenGrade(student.grade),
    });
    if (normalized.data.clarifyingQuestion && normalized.data.confidence < 0.5) {
      return reply.code(200).send({
        gameId: null,
        status: 'clarify',
        clarifyingQuestion: normalized.data.clarifyingQuestion,
        stubSpec: null,
      });
    }

    const meta: Meta = {
      gameType: body.gameType as GameType,
      theme: body.theme,
      subject: normalized.data.subject,
      topic: normalized.data.topic,
      language,
      grade: gameGenGrade(student.grade),
      difficulty: body.difficulty,
      sessionLength: body.sessionLength,
      numerals: language === 'ar' ? 'arabic_indic' : 'western',
    };
    const sBlock = studentBlock(student);

    const game = await store.createGame({
      id: crypto.randomUUID(),
      studentId: student.id,
      gameType: meta.gameType,
      theme: meta.theme,
      subject: meta.subject,
      topic: meta.topic,
      language,
      status: 'generating',
      error: null,
      spec: null,
      shellVersion: shellVersionFor(meta.gameType),
      thumbnailUrl: null,
    });

    stamps.push(now);
    generationTimestamps.set(student.id, stamps);
    runGenerationJob(game.id, {
      meta,
      student: sBlock,
      normalized: { confidence: normalized.data.confidence, complexity: normalized.data.complexity, notes: normalized.data.notes },
    });

    // Progressive start: the client opens the shell with this stub instantly.
    return reply.code(201).send({
      gameId: game.id,
      status: 'generating',
      clarifyingQuestion: null,
      stubSpec: buildStubSpec(meta, sBlock),
    });
  });

  // ------------------------------------------------ status + spec + play
  async function ownedGame(req: { student?: StudentRow; params: unknown }, id: string) {
    const g = await store.getGame(id);
    if (!g || g.deletedAt || g.studentId !== req.student!.id) return null;
    return g;
  }

  app.get('/api/v1/games/library', { preHandler: auth }, async (req) => {
    const q = req.query as { limit?: string; offset?: string };
    const limit = Math.min(Number(q.limit) || 50, 100);
    const offset = Number(q.offset) || 0;
    const { items, total } = await store.listGames(req.student!.id, { limit, offset });
    return { items: items.map(gameView), total, limit, offset };
  });

  app.get('/api/v1/games/:id', { preHandler: auth }, async (req, reply) => {
    const g = await ownedGame(req, (req.params as { id: string }).id);
    if (!g) return err(reply, req.id, 404, 'NOT_FOUND', 'game not found');
    return gameView(g);
  });

  app.get('/api/v1/games/:id/spec', { preHandler: auth }, async (req, reply) => {
    const g = await ownedGame(req, (req.params as { id: string }).id);
    if (!g) return err(reply, req.id, 404, 'NOT_FOUND', 'game not found');
    if (g.status === 'generating') {
      return reply.code(202).header('retry-after', '2').send({ status: 'generating' });
    }
    if (g.status === 'failed' || !g.spec) {
      return err(reply, req.id, 410, 'GENERATION_FAILED', g.error ?? 'generation failed — retry the game');
    }
    return g.spec;
  });

  app.get('/api/v1/games/:id/play', { preHandler: auth }, async (req, reply) => {
    const g = await ownedGame(req, (req.params as { id: string }).id);
    if (!g) return err(reply, req.id, 404, 'NOT_FOUND', 'game not found');
    if (g.status === 'generating') {
      return reply.code(202).header('retry-after', '2').send({ status: 'generating' });
    }
    if (g.status === 'failed' || !g.spec) {
      return err(reply, req.id, 410, 'GENERATION_FAILED', g.error ?? 'generation failed');
    }
    const etag = `"${g.id}-${g.shellVersion}"`;
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    let html: string;
    try {
      html = assembleHtml(g.gameType, g.spec);
    } catch {
      return err(reply, req.id, 503, 'SHELLS_NOT_BUILT', 'shells missing — run npm -w shells run build');
    }
    return reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('etag', etag)
      .header('cache-control', 'private, max-age=604800')
      .send(html);
  });

  // ----------------------------------------------------- patch + delete
  app.patch('/api/v1/games/:id', { preHandler: auth }, async (req, reply) => {
    const g = await ownedGame(req, (req.params as { id: string }).id);
    if (!g) return err(reply, req.id, 404, 'NOT_FOUND', 'game not found');
    const parsed = PatchGameBody.safeParse(req.body);
    if (!parsed.success) {
      return err(reply, req.id, 400, 'BAD_REQUEST', parsed.error.issues[0]?.message ?? 'invalid body');
    }
    const patch: Partial<GameRow> = {};
    if (parsed.data.bestScore != null && parsed.data.bestScore > g.bestScore) {
      patch.bestScore = parsed.data.bestScore;
    }
    if (parsed.data.played) {
      patch.playCount = g.playCount + 1;
      patch.lastPlayedAt = new Date();
    }
    const updated = await store.updateGame(g.id, patch);
    return gameView(updated);
  });

  app.delete('/api/v1/games/:id', { preHandler: auth }, async (req, reply) => {
    const g = await ownedGame(req, (req.params as { id: string }).id);
    if (!g) return err(reply, req.id, 404, 'NOT_FOUND', 'game not found');
    await store.updateGame(g.id, { deletedAt: new Date() });
    return reply.code(204).send();
  });

  // ------------------------------------------------------------- retry
  app.post('/api/v1/games/:id/retry', { preHandler: auth }, async (req, reply) => {
    const g = await ownedGame(req, (req.params as { id: string }).id);
    if (!g) return err(reply, req.id, 404, 'NOT_FOUND', 'game not found');
    if (g.status !== 'failed') return err(reply, req.id, 409, 'NOT_FAILED', 'game is not in failed state');
    const params = jobParams.get(g.id);
    if (!params) {
      return err(reply, req.id, 410, 'PARAMS_LOST', 'server restarted since generation — create the game again');
    }
    await store.updateGame(g.id, { status: 'generating', error: null });
    runGenerationJob(g.id, params);
    return { gameId: g.id, status: 'generating' };
  });

  // ------------------------------------------------------------- refine
  app.post('/api/v1/games/:id/refine', { preHandler: auth }, async (req, reply) => {
    const g = await ownedGame(req, (req.params as { id: string }).id);
    if (!g) return err(reply, req.id, 404, 'NOT_FOUND', 'game not found');
    if (g.status !== 'ready' || !g.spec) return err(reply, req.id, 409, 'NOT_READY', 'game is not ready');
    const parsed = RefineGameBody.safeParse(req.body);
    if (!parsed.success) {
      return err(reply, req.id, 400, 'BAD_REQUEST', parsed.error.issues[0]?.message ?? 'invalid body');
    }
    const spec: GameSpec = JSON.parse(JSON.stringify(g.spec));
    const op = parsed.data.op;

    if (op === 'theme') {
      const theme = parsed.data.theme;
      if (!theme || !(THEMES[g.gameType as GameType] as readonly string[]).includes(theme)) {
        return err(reply, req.id, 400, 'THEME_INVALID', `theme must be one of ${THEMES[g.gameType as GameType].join(', ')}`);
      }
      // $0, instant: re-assembly happens at serve time with the new theme.
      spec.meta.theme = theme;
      const updated = await store.updateGame(g.id, {
        spec,
        theme,
        thumbnailUrl: await thumbnailFor(g.topic, theme, app.log),
      });
      metrics.bump('refine_theme');
      return gameView(updated);
    }

    if (op === 'harder' || op === 'easier') {
      // $0: shift the adaptive baseline — the engine starts higher/lower and
      // the over-provisioned pools already span the bands (DECISIONS.md).
      const ladder = ['easy', 'normal', 'hard'] as const;
      const idx = ladder.indexOf(spec.meta.difficulty);
      const next = ladder[Math.max(0, Math.min(ladder.length - 1, idx + (op === 'harder' ? 1 : -1)))]!;
      spec.meta.difficulty = next;
      const updated = await store.updateGame(g.id, { spec });
      metrics.bump(`refine_${op}`);
      return gameView(updated);
    }

    // more_questions — Haiku appends items to existing levels (mock: clones variants)
    const params = jobParams.get(g.id);
    const meta = spec.meta;
    try {
      const { content } = await provider.generateContent(meta, {
        escalated: false,
        notes: 'Generate FRESH items different from typical first-pass questions; these extend an existing lesson.',
      });
      let li = 0;
      for (const level of spec.levels) {
        if (level.isIntro) continue;
        const fresh = content.levels[li++ % content.levels.length];
        if (!fresh) continue;
        const room = 6 - level.items.length;
        const additions = fresh.items.slice(0, room).map((raw, i) => ({
          ...(raw as object),
          kind: level.items[0]?.kind ?? 'mcq',
          id: `${level.items[0]?.id.split('_')[0] ?? `l${level.index}`}_x${i + 1}`,
        }));
        level.items.push(...(additions as GameSpec['levels'][number]['items']));
      }
      const updated = await store.updateGame(g.id, { spec });
      metrics.bump('refine_more_questions');
      if (params) jobParams.set(g.id, params);
      return gameView(updated);
    } catch (e) {
      return err(reply, req.id, 502, 'REFINE_FAILED', (e as Error).message);
    }
  });

  // ------------------------------------------- play sessions + feedback
  app.post('/api/v1/games/:id/sessions', { preHandler: auth }, async (req, reply) => {
    const g = await ownedGame(req, (req.params as { id: string }).id);
    if (!g) return err(reply, req.id, 404, 'NOT_FOUND', 'game not found');
    const parsed = PostSessionBody.safeParse(req.body);
    if (!parsed.success) {
      return err(reply, req.id, 400, 'BAD_REQUEST', parsed.error.issues[0]?.message ?? 'invalid body');
    }
    const result = await recordSession({ store, provider, log: app.log }, req.student!, g, parsed.data.summary);
    return reply.code(201).send(result);
  });
}
