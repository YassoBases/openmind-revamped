/**
 * Environment configuration. Everything has a dev-friendly default:
 * no DATABASE_URL → in-memory store; no ANTHROPIC_API_KEY → mock pipeline.
 * The server must always boot with `npm run dev` and zero setup.
 */
export interface Config {
  host: string;
  port: number;
  databaseUrl: string | null;
  anthropicApiKey: string | null;
  openaiApiKey: string | null;
  imageProviderApiKey: string | null;
  imageProviderUrl: string | null;
  mockLlm: boolean;
  /** why mock mode is active (for honest logging) */
  mockReason: string | null;
  promptCacheTtl: '5m' | '1h';
  modelDefault: string;
  modelEscalation: string;
  /**
   * Moderation is provider-neutral: MODERATION_PROVIDER selects the
   * implementation, MODERATION_API_KEY its credential (falls back to
   * OPENAI_API_KEY for the default 'openai' provider so existing setups
   * keep working).
   */
  moderationProvider: string;
  moderationApiKey: string | null;
  /**
   * True when a LIVE model serves students: moderation-API failures fail
   * CLOSED (input treated as flagged). False in keyless mock/dev/test.
   */
  moderationStrict: boolean;
  /** Explicit dev-only escape hatch: run a live model WITHOUT moderation. */
  moderationDisabled: boolean;
  /** measure first, then decide — default off (see DECISIONS.md) */
  escalateArabic: boolean;
  corsOrigins: string | boolean;
  maxGenerationsPerHour: number;
  maxWorldsPerHour: number;
  maxTutorMessagesPerHour: number;
  /** Stateless tool-verify calls (lesson-experience grading) — cheap, no LLM, so a per-minute budget fits better than per-hour. */
  maxToolVerifyPerMinute: number;
}

function bool(v: string | undefined, dflt = false): boolean {
  if (v == null) return dflt;
  return v === '1' || v.toLowerCase() === 'true';
}

export function loadConfig(env = process.env): Config {
  const anthropicApiKey = env.ANTHROPIC_API_KEY || null;
  const explicitMock = bool(env.MOCK_LLM);
  let mockLlm = explicitMock;
  let mockReason: string | null = explicitMock ? 'MOCK_LLM=true' : null;
  if (!mockLlm && !anthropicApiKey) {
    mockLlm = true;
    mockReason = 'no ANTHROPIC_API_KEY set — serving golden specs with simulated latency';
  }

  const moderationApiKey = env.MODERATION_API_KEY || env.OPENAI_API_KEY || null;
  // "Live" = a real model answers students — that's when moderation must
  // not fail open.
  const liveModel = !mockLlm && !!anthropicApiKey;

  return {
    host: env.HOST || '0.0.0.0', // LAN-reachable by default — phones must connect
    port: Number(env.PORT) || 8080,
    databaseUrl: env.DATABASE_URL || null,
    anthropicApiKey,
    openaiApiKey: env.OPENAI_API_KEY || null,
    imageProviderApiKey: env.IMAGE_PROVIDER_API_KEY || null,
    imageProviderUrl: env.IMAGE_PROVIDER_URL || null,
    mockLlm,
    mockReason,
    promptCacheTtl: env.PROMPT_CACHE_TTL === '5m' ? '5m' : '1h',
    modelDefault: env.MODEL_DEFAULT || 'claude-haiku-4-5',
    modelEscalation: env.MODEL_ESCALATION || 'claude-sonnet-4-6',
    moderationProvider: env.MODERATION_PROVIDER || 'openai',
    moderationApiKey,
    moderationStrict: bool(env.MODERATION_STRICT, liveModel),
    moderationDisabled: bool(env.MODERATION_DISABLED),
    escalateArabic: bool(env.ESCALATE_ARABIC, false),
    corsOrigins: env.CORS_ORIGINS ? env.CORS_ORIGINS : true, // permissive in dev
    maxGenerationsPerHour: Number(env.MAX_GENERATIONS_PER_HOUR) || 20,
    maxWorldsPerHour: Number(env.MAX_WORLDS_PER_HOUR) || 6,
    maxTutorMessagesPerHour: Number(env.MAX_TUTOR_MESSAGES_PER_HOUR) || 60,
    maxToolVerifyPerMinute: Number(env.MAX_TOOL_VERIFY_PER_MINUTE) || 120,
  };
}

export const config = loadConfig();
