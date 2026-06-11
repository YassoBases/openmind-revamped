/**
 * Content moderation via OpenAI omni-moderation-latest (free tier).
 * Pre-check on the student's topic/inputs, post-check on every generated
 * spec text field. Skipped (with a loud one-time warning) when no
 * OPENAI_API_KEY is configured — acceptable in dev, documented in README.
 */
import { config } from '../config.js';
import { metrics } from '../pipeline/metrics.js';

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
  skipped: boolean;
}

let warnedOnce = false;

export async function moderate(
  inputs: string[],
  log: { warn: (msg: string) => void },
): Promise<ModerationResult> {
  if (!config.openaiApiKey) {
    if (!warnedOnce) {
      warnedOnce = true;
      log.warn('[moderation] OPENAI_API_KEY not set — moderation checks are SKIPPED (dev only; set the key for production)');
    }
    return { flagged: false, categories: [], skipped: true };
  }

  const started = Date.now();
  // The moderation endpoint caps input sizes; chunk to be safe.
  const chunks: string[][] = [];
  for (let i = 0; i < inputs.length; i += 32) chunks.push(inputs.slice(i, i + 32));

  const categories = new Set<string>();
  let flagged = false;
  for (const chunk of chunks) {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: chunk }),
    });
    if (!res.ok) {
      log.warn(`[moderation] API error ${res.status} — treating as not flagged`);
      metrics.bump('moderation_error');
      continue;
    }
    const data = (await res.json()) as {
      results: Array<{ flagged: boolean; categories: Record<string, boolean> }>;
    };
    for (const r of data.results) {
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
