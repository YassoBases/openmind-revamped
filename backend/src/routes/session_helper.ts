/**
 * Shared session-recording logic: PlaySession row, XP events, streak math,
 * game stat bumps, summary enrichment. Used by POST /games/:id/sessions and
 * POST /review/sessions (review sessions have no backing game row but still
 * count toward streak and daily goal).
 */
import { XP_RULES } from '@edumind/shared';
import type { ContentProvider } from '../pipeline/provider.js';
import type { GameRow, Store, StudentRow } from '../store/types.js';

export async function recordSession(
  deps: { store: Store; provider: ContentProvider; log: { warn: (m: string) => void } },
  student: StudentRow,
  game: GameRow | null,
  summary: Record<string, unknown>,
) {
  const { store, provider, log } = deps;
  const xp = Math.max(0, Math.min(5000, Number(summary.xp) || 0));
  const accuracy = Math.max(0, Math.min(1, Number(summary.accuracy) || 0));

  const session = await store.createPlaySession({
    gameId: game?.id ?? null,
    studentId: student.id,
    summary,
    xp,
    accuracy,
  });
  await store.addXpEvent(student.id, xp, game ? `game:${game.topic}` : 'review:daily');

  // streak: one day-grain event; consecutive days grow the flame
  const today = new Date();
  const extendedToday = await store.addStreakDay(student.id, today);
  let streakCount = student.streakCount;
  let bonusXp = 0;
  if (extendedToday) {
    const dayMs = 86_400_000;
    const lastDay = student.streakLastPlayedAt ? Math.floor(student.streakLastPlayedAt.getTime() / dayMs) : null;
    const thisDay = Math.floor(today.getTime() / dayMs);
    streakCount = lastDay != null && thisDay - lastDay === 1 ? streakCount + 1 : 1;
    bonusXp = Math.min(XP_RULES.streakBonusPerDay * streakCount, XP_RULES.streakBonusCap);
    await store.addXpEvent(student.id, bonusXp, `streak:day${streakCount}`);
  }
  await store.updateStudent(student.id, {
    xp: student.xp + xp + bonusXp,
    streakCount,
    streakLastPlayedAt: today,
  });

  if (game) {
    const score = Math.round(accuracy * 100);
    await store.updateGame(game.id, {
      bestScore: Math.max(game.bestScore, score),
      playCount: game.playCount + 1,
      lastPlayedAt: new Date(),
    });
  }

  // summary enrichment (~$0.004 live, canned in mock)
  let enriched = {
    headline: student.language === 'ar' ? `أحسنت يا ${student.name}!` : `Nice work, ${student.name}!`,
    body: '',
    reviewSuggestions: [] as string[],
  };
  try {
    const fb = await provider.feedback({ language: student.language, name: student.name, summary });
    enriched = fb.data;
  } catch (e) {
    log.warn(`[sessions] feedback enrichment failed: ${(e as Error).message}`);
  }

  return {
    sessionId: session.id,
    xpAwarded: xp + bonusXp,
    streak: { count: streakCount, extendedToday, bonusXp },
    enrichedFeedback: enriched,
  };
}
