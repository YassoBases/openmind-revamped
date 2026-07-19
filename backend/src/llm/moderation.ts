/**
 * Content moderation — provider-neutral seam. `MODERATION_PROVIDER` selects
 * the implementation (today: 'openai' omni-moderation-latest; the seam is
 * one function, so adding another provider never touches callers).
 *
 * Safety posture (minors are the audience):
 *  - LIVE (any live tutor/content model configured): moderation is REQUIRED.
 *    Boot refuses to start without a working moderation provider unless
 *    MODERATION_DISABLED=1 is set explicitly (dev-only escape hatch — every
 *    skipped request is still counted and logged).
 *  - A moderation-API failure is retried once, then treated as FLAGGED when
 *    strict (fail-closed): a moderation outage pauses tutor questions rather
 *    than letting unchecked input through to the model.
 *  - Keyless mock/dev/test keeps the old skip behavior (config.moderationStrict
 *    is false there), so CI and offline dev run unchanged.
 */
import { config } from '../config.js';
import { metrics } from '../pipeline/metrics.js';

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
  skipped: boolean;
}

let warnedOnce = false;

/** One provider call for a chunk; throws on non-2xx so the caller can retry. */
async function callProvider(chunk: string[]): Promise<Array<{ flagged: boolean; categories: Record<string, boolean> }>> {
  // 'openai' is the only registered provider today; the switch is the seam.
  switch (config.moderationProvider) {
    case 'openai': {
      const res = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.moderationApiKey}`,
        },
        body: JSON.stringify({ model: 'omni-moderation-latest', input: chunk }),
      });
      if (!res.ok) throw new Error(`moderation api ${res.status}`);
      const data = (await res.json()) as {
        results: Array<{ flagged: boolean; categories: Record<string, boolean> }>;
      };
      return data.results;
    }
    default:
      throw new Error(`unknown moderation provider: ${config.moderationProvider}`);
  }
}

export async function moderate(
  inputs: string[],
  log: { warn: (msg: string) => void },
): Promise<ModerationResult> {
  if (!config.moderationApiKey) {
    if (!warnedOnce) {
      warnedOnce = true;
      log.warn('[moderation] no moderation key set — checks are SKIPPED (dev only; a live deployment refuses to boot like this unless MODERATION_DISABLED=1)');
    }
    // Per-request visibility: a misconfigured instance shows in metrics,
    // not just one boot log line.
    metrics.bump('moderation_skipped');
    return { flagged: false, categories: [], skipped: true };
  }

  const started = Date.now();
  // The moderation endpoint caps input sizes; chunk to be safe.
  const chunks: string[][] = [];
  for (let i = 0; i < inputs.length; i += 32) chunks.push(inputs.slice(i, i + 32));

  const categories = new Set<string>();
  let flagged = false;
  for (const chunk of chunks) {
    let results: Array<{ flagged: boolean; categories: Record<string, boolean> }> | null = null;
    // One retry, then the strict posture decides.
    for (let attempt = 0; attempt < 2 && !results; attempt++) {
      try {
        results = await callProvider(chunk);
      } catch (err) {
        log.warn(`[moderation] ${(err as Error).message} (attempt ${attempt + 1}/2)`);
        metrics.bump('moderation_error');
      }
    }
    if (!results) {
      if (config.moderationStrict) {
        // Fail CLOSED for minors: an unverifiable input is a blocked input.
        metrics.bump('moderation_failed_closed');
        return { flagged: true, categories: ['moderation_unavailable'], skipped: false };
      }
      log.warn('[moderation] API unavailable — treating as not flagged (non-strict mode)');
      continue;
    }
    for (const r of results) {
      if (r.flagged) {
        flagged = true;
        for (const [cat, hit] of Object.entries(r.categories)) if (hit) categories.add(cat);
      }
    }
  }
  metrics.record('moderation', Date.now() - started);
  if (flagged) metrics.bump('moderation_flagged');
  return { flagged, categories: [...categories], skipped: false };
}
