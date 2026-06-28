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
