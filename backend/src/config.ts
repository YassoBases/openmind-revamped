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
  /** measure first, then decide — default off (see DECISIONS.md) */
  escalateArabic: boolean;
  corsOrigins: string | boolean;
  maxGenerationsPerHour: number;
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
    escalateArabic: bool(env.ESCALATE_ARABIC, false),
    corsOrigins: env.CORS_ORIGINS ? env.CORS_ORIGINS : true, // permissive in dev
    maxGenerationsPerHour: Number(env.MAX_GENERATIONS_PER_HOUR) || 20,
  };
}

export const config = loadConfig();
