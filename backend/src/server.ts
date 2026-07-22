import 'dotenv/config';
import { buildApp } from './app.js';
import { config } from './config.js';
import { MockProvider } from './llm/mock.js';
import { ensureShellData } from './pipeline/assembler.js';
import { LiveProvider } from './pipeline/provider.js';
import { createStore } from './store/index.js';

async function main() {
  const provider = config.mockLlm ? new MockProvider() : new LiveProvider();
  const bootLog = {
    info: (m: string) => console.log(m),
    warn: (m: string) => console.warn(m),
  };
  if (config.mockLlm) {
    bootLog.warn(`[llm] MOCK MODE — ${config.mockReason}`);
  } else {
    bootLog.info(`[llm] live: ${config.modelDefault} (escalation: ${config.modelEscalation}, cache ttl: ${config.promptCacheTtl})`);
  }

  // A live model serving minors REQUIRES a working moderation provider.
  // MODERATION_DISABLED=1 is the explicit dev-only escape hatch; every
  // skipped request still bumps the moderation_skipped metric.
  const liveModel = !config.mockLlm && !!config.anthropicApiKey;
  if (liveModel && !config.moderationApiKey) {
    if (config.moderationDisabled) {
      bootLog.warn('[moderation] MODERATION_DISABLED=1 — live model WITHOUT moderation (development only; never ship this)');
    } else {
      console.error(
        '[moderation] refusing to start: a live model is configured but no moderation provider is.\n' +
        `  Set MODERATION_API_KEY (provider: ${config.moderationProvider}), or set MODERATION_DISABLED=1 for local development only.`,
      );
      process.exit(1);
    }
  }

  const store = await createStore(bootLog);
  ensureShellData(bootLog);

  const app = await buildApp({ store, provider });
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`OpenMind backend on http://${config.host}:${config.port} — docs at /api/docs`);
  if (config.host === '0.0.0.0') {
    app.log.info('LAN-reachable: point your phone at http://<your-laptop-ip>:' + config.port);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
