/**
 * Shared session-recording logic: PlaySession row, XP events, streak math,
 * game stat bumps, summary enrichment, and learning-evidence derivation.
 * Used by POST /games/:id/sessions and POST /review/sessions (review
 * sessions have no backing game row but still count toward streak and
 * daily goal).
 */
import { XP_RULES } from '@edumind/shared';
import type { ContentProvider } from '../pipeline/provider.js';
import type { GameRow, LearnEvidenceInput, Store, StudentRow } from '../store/types.js';

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

  // Game play IS learning evidence: one `game_item` row per summary item
  // flows into the same append-only store the learn engine reads. Ids are
  // derived from the session so replayed submissions stay idempotent.
  // Best-effort — a telemetry failure must never fail the session.
  try {
    const events = gameEvidenceFromSummary(session.id, game, summary);
    if (events.length) await store.upsertLearnEvidence(student.id, events);
  } catch (e) {
    log.warn(`[sessions] evidence derivation failed: ${(e as Error).message}`);
  }

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

/**
 * Derive `game_item` evidence rows from a shell's reportSummary items.
 * The summary is client-authored, so every field is coerced and capped;
 * items that lack an id or a concept tag carry no evidence and are skipped.
 * Semantics mirror the shells: `correct` = first try, `recovered` = solved
 * on a supportive retry (stored as incorrect + recovered, the same shape the
 * learn engine uses for recovered-after-error).
 */
/** Item kind → evidence kind: manipulation/assembly kinds are construction
 *  evidence; recognition kinds (tap a choice, tap objects) are recall. */
const EVIDENCE_KIND_BY_ITEM: Record<string, 'construction' | 'recall'> = {
  mcq: 'recall',
  tap_scene: 'recall',
  connect: 'construction',
  drag_collect: 'construction',
  sequence: 'construction',
  build_complete: 'construction',
};

export function gameEvidenceFromSummary(
  sessionId: string,
  game: GameRow | null,
  summary: Record<string, unknown>,
): LearnEvidenceInput[] {
  const items = Array.isArray(summary.items) ? summary.items.slice(0, 60) : [];
  const gameType = typeof summary.gameType === 'string' ? summary.gameType : game?.gameType ?? null;
  const gameKind = gameType === 'draw_connect' ? 'construction' : 'recall';
  const now = new Date();
  const events: LearnEvidenceInput[] = [];

  for (const raw of items) {
    if (typeof raw !== 'object' || raw == null) continue;
    const it = raw as Record<string, unknown>;
    const itemId = typeof it.id === 'string' ? it.id.slice(0, 24) : null;
    const concept = Array.isArray(it.concepts) && typeof it.concepts[0] === 'string'
      ? (it.concepts[0] as string).slice(0, 60)
      : null;
    if (!itemId || !concept) continue;
    const firstTry = it.correct === true;
    const recovered = it.recovered === true;
    // Newer shells report the item kind per row; fall back to the game-level
    // mapping for summaries recorded before the kind field existed.
    const kind = (typeof it.kind === 'string' && EVIDENCE_KIND_BY_ITEM[it.kind]) || gameKind;
    events.push({
      id: `gi_${sessionId}_${itemId}`.slice(0, 64),
      skillId: `game:${concept}`,
      representation: 'game',
      // The checkpoint beat (six-beat learning flow) is the level's own
      // "show what you know" moment — kept as evidence context.
      context: it.beat === 'checkpoint' ? 'checkpoint' : null,
      source: 'game_item',
      kind,
      outcome: firstTry ? 'correct' : 'incorrect',
      verification: 'client_reported',
      attempt: Math.max(1, Math.min(99, Number(it.attempts) || 1)),
      hints: Math.max(0, Math.min(99, Number(it.hintsUsed) || 0)),
      recovered,
      errorPattern: null,
      toolId: gameType,
      pathId: null,
      experienceId: game?.id ?? null,
      stepIndex: Number.isInteger(it.levelIndex) ? (it.levelIndex as number) : null,
      ms: null,
      createdAt: now,
    });
  }
  return events;
}
