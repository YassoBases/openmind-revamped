/**
 * Anthropic client wrapper.
 *
 * Every call: messages.stream().finalMessage() (the SDK rejects non-stream
 * requests at high max_tokens), structured outputs via output_config.format
 * (schemas pre-sanitized in @edumind/shared), prompt caching via
 * cache_control {type:'ephemeral', ttl} on the static system prompt (TTL is
 * env-configurable; 1h writes cost 2x base input, 5m 1.25x — see PERF.md).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { config } from '../config.js';
import { metrics } from '../pipeline/metrics.js';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: config.anthropicApiKey ?? undefined });
  }
  return _client;
}

// $/MTok (input, output) — claude-haiku-4-5 / claude-sonnet-4-6
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
};

export interface StructuredCallResult<T> {
  data: T;
  model: string;
  ms: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    estCostUsd: number;
  };
}

export class StructuredCallError extends Error {
  constructor(
    message: string,
    public readonly stage: 'api' | 'json' | 'schema',
    public readonly raw?: string,
  ) {
    super(message);
  }
}

/**
 * One structured call: system prompt cached, user message volatile,
 * JSON-schema-constrained output, Zod-validated result.
 */
export async function structuredCall<T>(opts: {
  model: string;
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
  zodSchema: z.ZodType<T>;
  maxTokens?: number;
  stage: string; // metrics label: normalizer | spec | factcheck | repair | feedback
}): Promise<StructuredCallResult<T>> {
  const started = Date.now();
  let final;
  try {
    const stream = client().messages.stream({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 16000,
      system: [
        {
          type: 'text',
          text: opts.system,
          cache_control: { type: 'ephemeral', ttl: config.promptCacheTtl },
        },
      ],
      messages: [{ role: 'user', content: opts.user }],
      output_config: {
        format: { type: 'json_schema', schema: opts.jsonSchema },
      },
    } as Parameters<ReturnType<typeof client>['messages']['stream']>[0]);
    final = await stream.finalMessage();
  } catch (err) {
    metrics.record(`${opts.stage}_error`, Date.now() - started);
    throw new StructuredCallError(
      `Anthropic call failed (${opts.stage}): ${(err as Error).message}`,
      'api',
    );
  }

  const ms = Date.now() - started;
  const text = final.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    metrics.record(`${opts.stage}_badjson`, ms);
    throw new StructuredCallError(`Model returned non-JSON output (${opts.stage})`, 'json', text.slice(0, 600));
  }

  const validated = opts.zodSchema.safeParse(parsed);
  if (!validated.success) {
    metrics.record(`${opts.stage}_badshape`, ms);
    throw new StructuredCallError(
      `Structured output failed Zod validation (${opts.stage}): ${validated.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
      'schema',
      text.slice(0, 600),
    );
  }

  const u = final.usage;
  const price = PRICES[opts.model] ?? PRICES['claude-haiku-4-5']!;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const writeMultiplier = config.promptCacheTtl === '1h' ? 2 : 1.25;
  const estCostUsd =
    (u.input_tokens / 1e6) * price.in +
    (cacheRead / 1e6) * price.in * 0.1 +
    (cacheWrite / 1e6) * price.in * writeMultiplier +
    (u.output_tokens / 1e6) * price.out;

  metrics.record(opts.stage, ms);
  metrics.addUsage({
    stage: opts.stage,
    model: opts.model,
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    estCostUsd,
  });

  return {
    data: validated.data,
    model: opts.model,
    ms,
    usage: {
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      estCostUsd,
    },
  };
}
