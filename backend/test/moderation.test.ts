/**
 * Moderation posture tests — mocked global fetch, never a real API.
 * Covers: flagged input flags; API failure retries once then fails CLOSED in
 * strict (live) mode; keyless mock/dev mode keeps the skip path; the skip is
 * visible per-request in metrics.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'production';

const { config } = await import('../src/config.js');
const { moderate } = await import('../src/llm/moderation.js');
const { metrics } = await import('../src/pipeline/metrics.js');

const silentLog = { warn: () => {} };

function moderationResponse(flagged: boolean, categories: Record<string, boolean> = {}): Response {
  return new Response(
    JSON.stringify({ results: [{ flagged, categories }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('moderate()', () => {
  const originalFetch = globalThis.fetch;
  let savedKey: string | null;
  let savedStrict: boolean;

  beforeEach(() => {
    savedKey = config.moderationApiKey;
    savedStrict = config.moderationStrict;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    (config as { moderationApiKey: string | null }).moderationApiKey = savedKey;
    (config as { moderationStrict: boolean }).moderationStrict = savedStrict;
  });

  it('keyless (mock/dev/test) keeps the skip path and counts it in metrics', async () => {
    (config as { moderationApiKey: string | null }).moderationApiKey = null;
    const before = metrics.snapshot().counters['moderation_skipped'] ?? 0;
    const res = await moderate(['سؤال عادي'], silentLog);
    expect(res).toEqual({ flagged: false, categories: [], skipped: true });
    expect(metrics.snapshot().counters['moderation_skipped']).toBe(before + 1);
  });

  it('flags flagged input with its categories', async () => {
    (config as { moderationApiKey: string | null }).moderationApiKey = 'mk-test';
    globalThis.fetch = vi.fn(async () =>
      moderationResponse(true, { violence: true, harassment: false }),
    ) as unknown as typeof fetch;
    const res = await moderate(['bad input'], silentLog);
    expect(res.flagged).toBe(true);
    expect(res.categories).toEqual(['violence']);
    expect(res.skipped).toBe(false);
  });

  it('passes clean input', async () => {
    (config as { moderationApiKey: string | null }).moderationApiKey = 'mk-test';
    globalThis.fetch = vi.fn(async () => moderationResponse(false)) as unknown as typeof fetch;
    const res = await moderate(['كيف أحسب مساحة المثلث؟'], silentLog);
    expect(res.flagged).toBe(false);
  });

  it('retries once, then FAILS CLOSED in strict (live) mode', async () => {
    (config as { moderationApiKey: string | null }).moderationApiKey = 'mk-test';
    (config as { moderationStrict: boolean }).moderationStrict = true;
    const fetchMock = vi.fn(async () => new Response('oops', { status: 503 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const res = await moderate(['سؤال'], silentLog);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one retry
    expect(res.flagged).toBe(true); // unverifiable input is blocked input
    expect(res.categories).toEqual(['moderation_unavailable']);
  });

  it('a transient failure that recovers on retry still moderates normally', async () => {
    (config as { moderationApiKey: string | null }).moderationApiKey = 'mk-test';
    (config as { moderationStrict: boolean }).moderationStrict = true;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('oops', { status: 500 }))
      .mockResolvedValueOnce(moderationResponse(false));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const res = await moderate(['سؤال'], silentLog);
    expect(res.flagged).toBe(false);
    expect(res.skipped).toBe(false);
  });

  it('non-strict mode keeps the old fail-open behavior on API failure', async () => {
    (config as { moderationApiKey: string | null }).moderationApiKey = 'mk-test';
    (config as { moderationStrict: boolean }).moderationStrict = false;
    globalThis.fetch = vi.fn(async () => new Response('oops', { status: 503 })) as unknown as typeof fetch;
    const res = await moderate(['سؤال'], silentLog);
    expect(res.flagged).toBe(false);
  });
});

describe('loadConfig moderation posture', () => {
  it('strict defaults ON when a live model is configured, OFF otherwise', async () => {
    const { loadConfig } = await import('../src/config.js');
    const live = loadConfig({ ANTHROPIC_API_KEY: 'k', MODERATION_API_KEY: 'm' } as NodeJS.ProcessEnv);
    expect(live.moderationStrict).toBe(true);
    const dev = loadConfig({ MOCK_LLM: 'true' } as NodeJS.ProcessEnv);
    expect(dev.moderationStrict).toBe(false);
  });

  it('MODERATION_API_KEY falls back to OPENAI_API_KEY for the default provider', async () => {
    const { loadConfig } = await import('../src/config.js');
    const c = loadConfig({ OPENAI_API_KEY: 'legacy' } as NodeJS.ProcessEnv);
    expect(c.moderationApiKey).toBe('legacy');
    expect(c.moderationProvider).toBe('openai');
  });
});
