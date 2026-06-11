/**
 * Spec generation pipeline:
 *
 *   spec cache check (sha256 of content-determining fields, 24h TTL)
 *     → ContentSpec generation (Haiku by default; Sonnet when the normalizer
 *       flagged complexity/low confidence, after two Haiku failures, or for
 *       Arabic when ESCALATE_ARABIC is enabled)
 *     → assembly (intro level + ids + student block via @edumind/shared)
 *     → structural + semantic validators
 *     → fact-check pass (Haiku judge) → targeted item repair (max 2 rounds)
 *     → post-moderation on every text field
 *     → cache content (de-personalized) → persist GameSpec
 *
 * Whole-spec regeneration only happens when an attempt fails outright;
 * individual bad items are repaired or dropped (pool stays ≥4 per level).
 */
import { createHash } from 'node:crypto';
import {
  assembleConnectSpec,
  assembleMcqSpec,
  collectTextFields,
  parseAndValidateGameSpec,
  type ConnectContentSpec,
  type GameSpec,
  type Item,
  type McqContentSpec,
  type Meta,
  type Student,
} from '@edumind/shared';
import { moderate } from '../llm/moderation.js';
import type { Store } from '../store/types.js';
import { metrics } from './metrics.js';
import type { ContentProvider, FactCheckPiece } from './provider.js';

const SPEC_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_ITEMS_PER_LEVEL = 4;

export interface GenerationDeps {
  store: Store;
  provider: ContentProvider;
  log: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

export function specCacheKey(meta: Meta): string {
  const raw = [meta.subject, meta.topic, meta.language, meta.gameType, meta.theme, meta.grade, meta.difficulty, meta.sessionLength].join('|');
  return createHash('sha256').update(raw.toLowerCase()).digest('hex');
}

function assemble(meta: Meta, student: Student, content: McqContentSpec | ConnectContentSpec): GameSpec {
  return meta.gameType === 'draw_connect'
    ? assembleConnectSpec(meta, student, content as ConnectContentSpec)
    : assembleMcqSpec(meta, student, content as McqContentSpec);
}

function buildFactcheckPieces(spec: GameSpec): FactCheckPiece[] {
  const pieces: FactCheckPiece[] = [];
  for (const level of spec.levels) {
    if (level.isIntro) continue;
    for (const t of level.teaching) {
      pieces.push({ id: t.id, kind: 'teach', payload: { text: t.text } });
    }
    for (const item of level.items) {
      pieces.push({
        id: item.id,
        kind: 'item',
        payload:
          item.kind === 'mcq'
            ? {
                prompt: item.prompt,
                options: item.options,
                correctIndex: item.correctIndex,
                explanation: item.explanation,
                hints: item.hints,
              }
            : {
                prompt: item.prompt,
                edgeIds: item.edgeIds,
                explanation: item.explanation,
                hints: item.hints,
              },
      });
    }
  }
  return pieces;
}

/** Apply repaired items into a spec by id (server ids stay stable). */
function applyRepairs(spec: GameSpec, repairs: Array<Record<string, unknown> & { replacesId: string }>): number {
  let applied = 0;
  for (const level of spec.levels) {
    level.items = level.items.map((item) => {
      const fix = repairs.find((r) => r.replacesId === item.id);
      if (!fix) return item;
      applied++;
      const base: Record<string, unknown> = {
        ...item,
        prompt: fix.prompt ?? item.prompt,
        explanation: fix.explanation ?? item.explanation,
        hints: fix.hints ?? item.hints,
        concepts: fix.concepts ?? item.concepts,
        difficulty: fix.difficulty ?? item.difficulty,
      };
      if (item.kind === 'mcq') {
        base.options = fix.options ?? item.options;
        base.correctIndex = fix.correctIndex ?? item.correctIndex;
      } else if (fix.edgeIds) {
        base.edgeIds = fix.edgeIds;
      }
      return base as unknown as Item;
    });
  }
  return applied;
}

/** Drop irreparable items if every level keeps a workable pool. */
function dropItems(spec: GameSpec, ids: Set<string>): boolean {
  for (const level of spec.levels) {
    if (level.isIntro) continue;
    const kept = level.items.filter((i) => !ids.has(i.id));
    if (kept.length < MIN_ITEMS_PER_LEVEL) return false;
    if (new Set(kept.map((i) => i.difficulty)).size < 2) return false;
  }
  for (const level of spec.levels) {
    level.items = level.items.filter((i) => !ids.has(i.id));
  }
  return true;
}

export interface GenerationResult {
  spec: GameSpec;
  fromCache: boolean;
  escalated: boolean;
  model: string;
}

export async function generateSpec(
  deps: GenerationDeps,
  params: {
    meta: Meta;
    student: Student;
    normalized: { confidence: number; complexity: number; notes?: string | null };
  },
): Promise<GenerationResult> {
  const { store, provider, log } = deps;
  const { meta, student } = params;
  const startedAll = Date.now();

  // ---- spec cache: repeated topics are nearly free --------------------
  const key = specCacheKey(meta);
  const cached = await store.cacheGet(key);
  if (cached) {
    const spec = assemble(meta, student, cached as unknown as McqContentSpec | ConnectContentSpec);
    const check = parseAndValidateGameSpec(spec);
    if (check.result.ok) {
      metrics.bump('spec_cache_hit');
      metrics.bump('generation_ok');
      metrics.record('generation_total', Date.now() - startedAll);
      log.info(`[generate] spec cache hit for "${meta.topic}" (${meta.gameType})`);
      return { spec: check.spec!, fromCache: true, escalated: false, model: 'cache' };
    }
    log.warn('[generate] cached content failed validation — regenerating');
  }
  metrics.bump('spec_cache_miss');

  // ---- escalation plan -------------------------------------------------
  const preEscalate =
    params.normalized.complexity > 0.7 ||
    params.normalized.confidence < 0.6 ||
    (meta.language === 'ar' && process.env.ESCALATE_ARABIC === 'true');
  // Haiku gets two shots, then Sonnet; pre-escalated requests go straight to Sonnet.
  const attempts = preEscalate ? [true, true] : [false, false, true];

  let lastError = 'unknown';
  for (let attempt = 0; attempt < attempts.length; attempt++) {
    const escalated = attempts[attempt]!;
    if (escalated) metrics.bump('escalation');
    try {
      const { content, model } = await provider.generateContent(meta, {
        escalated,
        notes: params.normalized.notes ?? null,
      });
      const spec = assemble(meta, student, content);

      // ---- structural + semantic validators --------------------------
      const check = parseAndValidateGameSpec(spec);
      if (!check.result.ok) {
        lastError = `validation: ${check.result.issues.slice(0, 4).map((i) => i.code).join(', ')}`;
        metrics.bump('validation_failure');
        log.warn(`[generate] attempt ${attempt + 1} failed ${lastError}`);
        continue;
      }
      let validSpec = check.spec!;

      // ---- fact-check pass (mandatory) --------------------------------
      let pieces = buildFactcheckPieces(validSpec);
      let report = await provider.factcheck(pieces, {
        topic: meta.topic,
        grade: meta.grade,
        language: meta.language,
      });
      let failures = report.data.verdicts.filter((v) => v.verdict === 'fail');

      let repairRound = 0;
      while (failures.length > 0 && repairRound < 2) {
        repairRound++;
        metrics.bump('factcheck_failure', failures.length);
        log.warn(`[generate] fact-check failed ${failures.length} piece(s) — targeted repair round ${repairRound}`);

        const failedTeach = failures.filter((f) => f.targetId.includes('_t'));
        const failedItems = failures.filter((f) => !f.targetId.includes('_t'));

        // Teach cards can't be item-repaired; a bad teach card fails the attempt.
        if (failedTeach.length > 0) {
          lastError = `fact-check: teach card(s) failed: ${failedTeach.map((f) => f.reason).join('; ')}`;
          break;
        }

        const failureDetails = failedItems.map((f) => {
          const item = validSpec.levels.flatMap((l) => l.items).find((i) => i.id === f.targetId);
          return { item: item as unknown, reason: f.reason };
        }).filter((f) => f.item);
        if (!failureDetails.length) break;

        const levelOfFirst = validSpec.levels.find((l) => l.items.some((i) => i.id === failedItems[0]!.targetId));
        const repair = await provider.repair({
          meta,
          teachCards: (levelOfFirst?.teaching ?? []).map((t) => ({ id: t.id, text: t.text })),
          failures: failureDetails,
          diagramSummary: validSpec.diagram
            ? `nodes: ${validSpec.diagram.nodes.map((n) => n.id).join(', ')}; edges: ${validSpec.diagram.edges.map((e) => `${e.from}->${e.to}`).join(', ')}`
            : undefined,
          escalated,
        });
        metrics.bump('repair_round');
        applyRepairs(validSpec, repair.data.items as Array<Record<string, unknown> & { replacesId: string }>);

        // Repaired spec must still validate structurally.
        const recheck = parseAndValidateGameSpec(validSpec);
        if (!recheck.result.ok) {
          lastError = `repair broke validation: ${recheck.result.issues[0]?.code}`;
          break;
        }
        validSpec = recheck.spec!;

        // Re-judge only the repaired pieces.
        pieces = buildFactcheckPieces(validSpec).filter((p) => failures.some((f) => f.targetId === p.id));
        report = await provider.factcheck(pieces, { topic: meta.topic, grade: meta.grade, language: meta.language });
        failures = report.data.verdicts.filter((v) => v.verdict === 'fail');
      }

      if (failures.length > 0) {
        // Last resort: drop the bad items if every level keeps a real pool.
        const dropIds = new Set(failures.map((f) => f.targetId));
        if (!dropItems(validSpec, dropIds)) {
          lastError = `fact-check failures unrecoverable: ${failures.map((f) => f.reason).slice(0, 2).join('; ')}`;
          log.warn(`[generate] attempt ${attempt + 1}: ${lastError}`);
          continue;
        }
        log.warn(`[generate] dropped ${dropIds.size} irreparable item(s)`);
        const recheck = parseAndValidateGameSpec(validSpec);
        if (!recheck.result.ok) {
          lastError = 'spec invalid after dropping items';
          continue;
        }
        validSpec = recheck.spec!;
      }

      // ---- post-moderation on all spec text fields ---------------------
      const mod = await moderate(collectTextFields(validSpec), log);
      if (mod.flagged) {
        lastError = `post-moderation flagged: ${mod.categories.join(', ')}`;
        metrics.bump('moderation_post_flagged');
        break; // not retryable — the topic itself produced flagged content
      }

      // ---- cache the de-personalized content & finish ------------------
      await store.cacheSet(key, content as unknown as Record<string, unknown>, SPEC_CACHE_TTL_MS);
      metrics.bump('generation_ok');
      metrics.record('generation_total', Date.now() - startedAll);
      log.info(`[generate] "${meta.topic}" ok in ${Date.now() - startedAll}ms (model=${model}, attempt=${attempt + 1})`);
      return { spec: validSpec, fromCache: false, escalated, model };
    } catch (err) {
      lastError = (err as Error).message;
      metrics.bump('generation_attempt_error');
      log.warn(`[generate] attempt ${attempt + 1} threw: ${lastError}`);
    }
  }

  metrics.bump('generation_failed');
  metrics.record('generation_total', Date.now() - startedAll);
  throw new Error(`generation failed after ${attempts.length} attempts: ${lastError}`);
}
