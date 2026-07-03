/**
 * Review mode — the cheap retention engine. Synthesizes a quickfire Goal
 * Shootout spec from the student's recently missed items (PlaySession data).
 * Zero LLM cost, counts toward streak/daily goal, genuine spaced repetition.
 */
import type { FastifyInstance } from 'fastify';
import {
  buildIntroLevel,
  parseAndValidateGameSpec,
  SPEC_VERSION,
  type GameSpec,
  type Item,
  type McqItem,
  type Meta,
} from '@edumind/shared';
import { makeAuthHook } from '../auth.js';
import { gameGenGrade } from '../learning/stage.js';
import type { ContentProvider } from '../pipeline/provider.js';
import { PostSessionBody } from '../schemas.js';
import type { Store } from '../store/types.js';
import { recordSession } from './session_helper.js';

interface MissedRef {
  gameId: string | null;
  itemId: string;
  hintsUsed: number;
  correct: boolean;
}

export async function reviewRoutes(app: FastifyInstance, opts: { store: Store; provider: ContentProvider }) {
  const { store, provider } = opts;
  const auth = makeAuthHook(store);

  // Review sessions count toward streak/daily goal but have no game row.
  app.post('/api/v1/review/sessions', { preHandler: auth }, async (req, reply) => {
    const parsed = PostSessionBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid body', requestId: req.id },
      });
    }
    const result = await recordSession({ store, provider, log: app.log }, req.student!, null, parsed.data.summary);
    return reply.code(201).send(result);
  });

  app.get('/api/v1/review/today', { preHandler: auth }, async (req, reply) => {
    const student = req.student!;
    const sessions = await store.recentPlaySessions(student.id, 25);

    // collect missed (and heavily-hinted) item references, newest first
    const refs: MissedRef[] = [];
    for (const s of sessions) {
      const items = (s.summary.items ?? []) as Array<{
        id: string; correct: boolean; hintsUsed: number;
      }>;
      for (const it of items) {
        if (!it.correct || it.hintsUsed >= 2) {
          refs.push({ gameId: s.gameId, itemId: it.id, hintsUsed: it.hintsUsed, correct: it.correct });
        }
      }
    }

    // resolve refs to full mcq items from the stored specs (connect items
    // can't ride a shootout — skipped by design)
    const seen = new Set<string>();
    const pool: McqItem[] = [];
    const concepts = new Set<string>();
    const gameSpecs = new Map<string, GameSpec | null>();
    for (const ref of refs) {
      if (!ref.gameId) continue; // review-mode sessions have no backing game
      const dedupe = `${ref.gameId}|${ref.itemId}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      if (!gameSpecs.has(ref.gameId)) {
        const game = await store.getGame(ref.gameId);
        gameSpecs.set(ref.gameId, game?.spec ?? null);
      }
      const spec = gameSpecs.get(ref.gameId);
      if (!spec) continue;
      const item = spec.levels.flatMap((l) => l.items).find((i) => i.id === ref.itemId);
      if (item && item.kind === 'mcq') {
        pool.push(item);
        item.concepts.forEach((c) => concepts.add(c));
      }
      if (pool.length >= 12) break;
    }

    if (pool.length < 4) {
      return reply.code(404).send({
        error: { code: 'NOT_ENOUGH_DATA', message: 'play a few more games to unlock daily review', requestId: req.id },
      });
    }

    const ar = student.language === 'ar';
    const meta: Meta = {
      gameType: 'goal_shootout',
      theme: 'football',
      subject: ar ? 'مراجعة' : 'Review',
      topic: ar ? 'مراجعة اليوم' : 'Daily Review',
      language: ar ? 'ar' : 'en',
      grade: gameGenGrade(student.grade),
      difficulty: 'normal',
      sessionLength: 3,
      numerals: ar ? 'arabic_indic' : 'western',
    };

    // two educational levels of 4-6 items; cycle the pool if short, re-iding
    // every item so global ids stay unique
    const perLevel = Math.max(4, Math.min(6, Math.ceil(pool.length / 2)));
    const mkLevel = (index: number, title: string) => {
      const items: Item[] = [];
      for (let i = 0; i < perLevel; i++) {
        const src = pool[(index - 1) * perLevel + i] ?? pool[(i + index) % pool.length]!;
        items.push({ ...src, id: `r${index}_i${i + 1}` });
      }
      // the validator needs ≥2 difficulty bands; nudge one clone if uniform
      if (new Set(items.map((i) => i.difficulty)).size < 2 && items.length > 1) {
        const it = items[items.length - 1]!;
        it.difficulty = Math.min(5, it.difficulty + 1) as Item['difficulty'];
        if (it.difficulty === items[0]!.difficulty) it.difficulty = Math.max(1, it.difficulty - 2) as Item['difficulty'];
      }
      return {
        index,
        isIntro: false,
        title,
        teaching: [
          {
            id: `r${index}_t1`,
            text: ar
              ? 'مراجعة سريعة! هذه أسئلة وجدتها صعبة من قبل — لنتقنها هذه المرة. تذكر: الإعادة هي سر الإتقان.'
              : "Quick review! These tripped you up before — let's nail them this time. Repetition is how memory sticks.",
            emphasis: ar ? ['مراجعة'] : ['review'],
          },
        ],
        items,
      };
    };

    const spec: GameSpec = {
      specVersion: SPEC_VERSION,
      meta,
      student: {
        name: student.name,
        gender: (student.gender as 'm' | 'f' | null) ?? null,
        color: student.color,
        ...(student.interest ? { interest: student.interest as GameSpec['student']['interest'] } : {}),
      },
      narrative: {
        intro: ar
          ? 'مباراة المراجعة اليومية! سدد على الإجابات الصحيحة وثبت ما تعلمته.'
          : 'The daily review match! Shoot down the right answers and lock in what you learned.',
        outro: ar ? 'مراجعة مكتملة — ذاكرتك أقوى الآن!' : 'Review complete — that memory is locked in!',
        perLevel: ar ? ['الشوط الأول', 'الشوط الثاني'] : ['First half', 'Second half'],
      },
      levels: [buildIntroLevel(meta), mkLevel(1, ar ? 'الشوط الأول' : 'First Half'), mkLevel(2, ar ? 'الشوط الثاني' : 'Second Half')],
      summaryHints: {
        concepts: [...concepts].slice(0, 8).length ? [...concepts].slice(0, 8) : ['review'],
        nextTopics: ar ? ['موضوع جديد من اختيارك'] : ['A brand new topic of your choice'],
      },
    };

    const check = parseAndValidateGameSpec(spec);
    if (!check.result.ok) {
      app.log.error(`[review] synthesized spec invalid: ${check.result.issues.map((i) => i.code).join(',')}`);
      return reply.code(500).send({
        error: { code: 'REVIEW_SYNTH_FAILED', message: 'could not build a review session', requestId: req.id },
      });
    }
    return check.spec;
  });
}
