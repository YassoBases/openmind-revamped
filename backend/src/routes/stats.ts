import type { FastifyInstance } from 'fastify';
import { makeAuthHook } from '../auth.js';
import { league } from '../schemas.js';
import type { Store } from '../store/types.js';

export async function statsRoutes(app: FastifyInstance, opts: { store: Store }) {
  const { store } = opts;
  const auth = makeAuthHook(store);

  app.get('/api/v1/students/me/stats', { preHandler: auth }, async (req) => {
    const s = req.student!;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const today = await store.playSessionsSince(s.id, midnight);
    const todayXp = today.reduce((a, x) => a + x.xp, 0);
    const { total } = await store.listGames(s.id, { limit: 1, offset: 0 });
    return {
      xp: s.xp,
      streakCount: s.streakCount,
      dailyGoal: s.dailyGoal,
      todaySessions: today.length,
      todayXp,
      goalMetToday: today.length >= s.dailyGoal,
      league: league(s.xp),
      gamesCount: total,
    };
  });

  // Did the streak survive? (call on app open; resets a lapsed flame)
  app.post('/api/v1/students/me/streak-check', { preHandler: auth }, async (req) => {
    const s = req.student!;
    const dayMs = 86_400_000;
    const thisDay = Math.floor(Date.now() / dayMs);
    const lastDay = s.streakLastPlayedAt ? Math.floor(s.streakLastPlayedAt.getTime() / dayMs) : null;
    let streakCount = s.streakCount;
    let lapsed = false;
    if (lastDay == null || thisDay - lastDay > 1) {
      lapsed = streakCount > 0;
      streakCount = 0;
      if (lapsed) await store.updateStudent(s.id, { streakCount: 0 });
    }
    return { streakCount, lapsed, playedToday: lastDay === thisDay };
  });

  app.get('/api/v1/students/me/xp-events', { preHandler: auth }, async (req) => {
    const q = req.query as { limit?: string };
    const events = await store.listXpEvents(req.student!.id, Math.min(Number(q.limit) || 50, 200));
    return {
      items: events.map((e) => ({
        id: e.id,
        amount: e.amount,
        reason: e.reason,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });
}
