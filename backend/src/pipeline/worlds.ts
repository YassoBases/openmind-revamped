/**
 * Lesson Worlds pipeline:
 *
 *   world creation — ONE combined LLM call → WorldPlan + stage-1 content,
 *     semantic plan validation (validateWorldPlan) + moderation of plan text.
 *   stage generation — stage cache check (de-personalized StageContent,
 *     ramp band in the key so per-child adaptation keeps cache hits)
 *     → one small LLM call guided by the plan (focus, beat, ramp,
 *       previous beat, performance note)
 *     → assembleStageSpec (ids, ladder rung from the PLAN, intro on stage 1)
 *     → structural + semantic validators (scope='stage')
 *     → fact-check → targeted repair (≤2 rounds) → drop fallback
 *     → post-moderation → cache.
 *
 * Same quality gates as the session pipeline (generator.ts) — smaller pieces,
 * faster and cheaper per call, and a bad stage never poisons a whole world.
 */
import { createHash } from 'node:crypto';
import {
  assembleStageSpec,
  collectTextFields,
  parseAndValidateGameSpec,
  validateWorldPlan,
  type GameSpec,
  type StageContent,
  type Student,
  type SummaryHints,
  type WorldPlanContent,
  type WorldStagePlan,
} from '@edumind/shared';
import { moderate } from '../llm/moderation.js';
import { metrics } from './metrics.js';
import { applyRepairs, buildFactcheckPieces, dropItems, type GenerationDeps } from './generator.js';

const STAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface WorldParams {
  subject: string;
  topic: string;
  language: 'en' | 'ar';
  grade: number;
  focusConcepts?: string[];
  notes?: string | null;
  preEscalate: boolean;
}

export interface WorldPlanResult {
  plan: WorldPlanContent;
  /** Raw stage-1 content from the combined call — assemble + gate it through
   *  generateStageSpec({ presupplied }) exactly like any other stage. */
  stage1Content: StageContent;
  model: string;
  escalated: boolean;
}

/** Create the world plan (+ stage-1 content) with the escalation ladder. */
export async function generateWorldPlan(deps: GenerationDeps, params: WorldParams): Promise<WorldPlanResult> {
  const { provider, log } = deps;
  const attempts = params.preEscalate ? [true] : [false, true];
  let lastError = 'unknown';

  for (let attempt = 0; attempt < attempts.length; attempt++) {
    const escalated = attempts[attempt]!;
    if (escalated) metrics.bump('world_plan_escalation');
    try {
      const { data, model } = await provider.planWorld({
        subject: params.subject,
        topic: params.topic,
        language: params.language,
        grade: params.grade,
        focusConcepts: params.focusConcepts,
        notes: params.notes ?? null,
        escalated,
      });

      const check = validateWorldPlan(data.plan, params.language);
      if (!check.ok) {
        lastError = `plan validation: ${check.issues.slice(0, 4).map((i) => i.code).join(', ')}`;
        metrics.bump('world_plan_validation_failure');
        log.warn(`[world] plan attempt ${attempt + 1} failed ${lastError}`);
        continue;
      }

      const planText = [
        data.plan.title,
        data.plan.arc.intro,
        data.plan.arc.outro,
        ...data.plan.stages.flatMap((s) => [s.focus, s.beat]),
      ];
      const mod = await moderate(planText, log);
      if (mod.flagged) {
        lastError = `plan moderation flagged: ${mod.categories.join(', ')}`;
        metrics.bump('moderation_post_flagged');
        break; // not retryable — the topic itself produced flagged content
      }

      metrics.bump('world_plan_ok');
      return { plan: data.plan, stage1Content: data.stage1, model, escalated };
    } catch (err) {
      lastError = (err as Error).message;
      metrics.bump('world_plan_attempt_error');
      log.warn(`[world] plan attempt ${attempt + 1} threw: ${lastError}`);
    }
  }
  metrics.bump('world_plan_failed');
  throw new Error(`world plan failed after ${attempts.length} attempts: ${lastError}`);
}

/** Content-determining fields only — the student is re-injected at assembly,
 *  and the ramp band is coarse (3 values) so adaptation keeps cache hits. */
export function stageCacheKey(
  world: { subject: string; topic: string; language: string; grade: number },
  stagePlan: WorldStagePlan,
  stageIndex: number,
): string {
  const raw = [
    'stage', world.subject, world.topic, world.language, world.grade, stageIndex,
    stagePlan.gameType, stagePlan.variant, stagePlan.theme ?? '', stagePlan.kit ?? '',
    stagePlan.learningLevel ?? '', stagePlan.focus, stagePlan.ramp,
  ].join('|');
  return createHash('sha256').update(raw.toLowerCase()).digest('hex');
}

export interface StageParams {
  world: {
    id: string;
    title: string;
    subject: string;
    topic: string;
    language: 'en' | 'ar';
    grade: number;
    arc: { intro: string; outro: string };
    summaryHints: SummaryHints;
  };
  stagePlan: WorldStagePlan;
  stageIndex: number;
  stageCount: number;
  student: Student;
  previousBeat: string | null;
  /** Coarse note on the child's previous-stage performance, or null. */
  performanceNote: string | null;
  /** Stage-1 content that arrived with the world plan (skips the LLM call
   *  but still runs every validation/fact-check/moderation gate). */
  presupplied?: StageContent;
}

export interface StageResult {
  spec: GameSpec;
  fromCache: boolean;
  escalated: boolean;
  model: string;
}

export async function generateStageSpec(deps: GenerationDeps, params: StageParams): Promise<StageResult> {
  const { store, provider, log } = deps;
  const { world, stagePlan, stageIndex, student } = params;
  const started = Date.now();

  const assembleAndValidate = (content: StageContent) => {
    const spec = assembleStageSpec({
      worldId: world.id,
      stageIndex,
      stageCount: params.stageCount,
      stagePlan,
      arc: world.arc,
      summaryHints: world.summaryHints,
      subject: world.subject,
      language: world.language,
      grade: world.grade,
      student,
      content,
    });
    return parseAndValidateGameSpec(spec);
  };

  // ---- stage cache ------------------------------------------------------
  const key = stageCacheKey(world, stagePlan, stageIndex);
  if (!params.presupplied) {
    const cached = await store.cacheGet(key);
    if (cached) {
      const check = assembleAndValidate(cached as unknown as StageContent);
      if (check.result.ok) {
        metrics.bump('stage_cache_hit');
        log.info(`[world] stage ${stageIndex} cache hit for "${world.topic}"`);
        return { spec: check.spec!, fromCache: true, escalated: false, model: 'cache' };
      }
      log.warn('[world] cached stage content failed validation — regenerating');
    }
    metrics.bump('stage_cache_miss');
  }

  const attempts = params.presupplied ? [false, true] : [false, true];
  let lastError = 'unknown';

  for (let attempt = 0; attempt < attempts.length; attempt++) {
    const escalated = attempts[attempt]!;
    if (escalated) metrics.bump('stage_escalation');
    try {
      // The presupplied content (from the combined world call) is attempt 0;
      // if its gates fail we fall through to a fresh escalated call.
      let content: StageContent;
      let model: string;
      if (params.presupplied && attempt === 0) {
        content = params.presupplied;
        model = 'world_plan';
      } else {
        const res = await provider.generateStage({
          world: {
            title: world.title,
            subject: world.subject,
            topic: world.topic,
            language: world.language,
            grade: world.grade,
            arc: world.arc,
          },
          stagePlan,
          stageIndex,
          stageCount: params.stageCount,
          previousBeat: params.previousBeat,
          performanceNote: params.performanceNote,
          escalated,
        });
        content = res.data;
        model = res.model;
      }

      const check = assembleAndValidate(content);
      if (!check.result.ok) {
        lastError = `validation: ${check.result.issues.slice(0, 4).map((i) => i.code).join(', ')}`;
        metrics.bump('stage_validation_failure');
        log.warn(`[world] stage ${stageIndex} attempt ${attempt + 1} failed ${lastError}`);
        continue;
      }
      let validSpec = check.spec!;

      // ---- fact-check + targeted repair (same gates, smaller pieces) ----
      let pieces = buildFactcheckPieces(validSpec);
      let report = await provider.factcheck(pieces, {
        topic: stagePlan.focus,
        grade: world.grade,
        language: world.language,
      });
      let failures = report.data.verdicts.filter((v) => v.verdict === 'fail');

      let repairRound = 0;
      let teachFailed = false;
      while (failures.length > 0 && repairRound < 2) {
        repairRound++;
        metrics.bump('factcheck_failure', failures.length);
        const failedTeach = failures.filter((f) => f.targetId.includes('_t'));
        const failedItems = failures.filter((f) => !f.targetId.includes('_t'));
        if (failedTeach.length > 0) {
          lastError = `fact-check: teach card(s) failed: ${failedTeach.map((f) => f.reason).join('; ')}`;
          teachFailed = true;
          break;
        }
        const failureDetails = failedItems
          .map((f) => ({
            item: validSpec.levels.flatMap((l) => l.items).find((i) => i.id === f.targetId) as unknown,
            reason: f.reason,
          }))
          .filter((f) => f.item);
        if (!failureDetails.length) break;

        const eduLevel = validSpec.levels.find((l) => !l.isIntro);
        const repair = await provider.repair({
          meta: validSpec.meta,
          teachCards: (eduLevel?.teaching ?? []).map((t) => ({ id: t.id, text: t.text })),
          failures: failureDetails,
          diagramSummary: validSpec.diagram
            ? `nodes: ${validSpec.diagram.nodes.map((n) => n.id).join(', ')}; edges: ${validSpec.diagram.edges.map((e) => `${e.from}->${e.to}`).join(', ')}`
            : undefined,
          escalated,
        });
        metrics.bump('repair_round');
        applyRepairs(validSpec, repair.data.items as Array<Record<string, unknown> & { replacesId: string }>);

        const recheck = parseAndValidateGameSpec(validSpec);
        if (!recheck.result.ok) {
          lastError = `repair broke validation: ${recheck.result.issues[0]?.code}`;
          teachFailed = true;
          break;
        }
        validSpec = recheck.spec!;

        pieces = buildFactcheckPieces(validSpec).filter((p) => failures.some((f) => f.targetId === p.id));
        report = await provider.factcheck(pieces, { topic: stagePlan.focus, grade: world.grade, language: world.language });
        failures = report.data.verdicts.filter((v) => v.verdict === 'fail');
      }
      if (teachFailed) continue;

      if (failures.length > 0) {
        const dropIds = new Set(failures.map((f) => f.targetId));
        if (!dropItems(validSpec, dropIds)) {
          lastError = `fact-check failures unrecoverable: ${failures.map((f) => f.reason).slice(0, 2).join('; ')}`;
          continue;
        }
        log.warn(`[world] stage ${stageIndex}: dropped ${dropIds.size} irreparable item(s)`);
        const recheck = parseAndValidateGameSpec(validSpec);
        if (!recheck.result.ok) {
          lastError = 'stage invalid after dropping items';
          continue;
        }
        validSpec = recheck.spec!;
      }

      // ---- post-moderation ---------------------------------------------
      const mod = await moderate(collectTextFields(validSpec), log);
      if (mod.flagged) {
        lastError = `post-moderation flagged: ${mod.categories.join(', ')}`;
        metrics.bump('moderation_post_flagged');
        break;
      }

      // ---- cache de-personalized content & finish ----------------------
      await store.cacheSet(key, content as unknown as Record<string, unknown>, STAGE_CACHE_TTL_MS);
      metrics.bump('stage_generation_ok');
      metrics.record('stage_generation_total', Date.now() - started);
      log.info(`[world] stage ${stageIndex} of "${world.topic}" ok in ${Date.now() - started}ms (model=${model})`);
      return { spec: validSpec, fromCache: false, escalated, model };
    } catch (err) {
      lastError = (err as Error).message;
      metrics.bump('stage_attempt_error');
      log.warn(`[world] stage ${stageIndex} attempt ${attempt + 1} threw: ${lastError}`);
    }
  }

  metrics.bump('stage_generation_failed');
  throw new Error(`stage ${stageIndex} generation failed: ${lastError}`);
}
