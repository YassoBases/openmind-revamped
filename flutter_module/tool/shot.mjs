// Screenshot the web build in build/web — pairs with serve.mjs.
//   node tool/shot.mjs [out.png] [waitMs]
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, 'live_check.png');
const waitMs = Number(process.argv[3] ?? 7000);
const PORT = 5077;

const server = spawn(process.execPath, [join(here, 'serve.mjs')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});
try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'load' });
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: out });
  console.log('saved', out, '| errors:', errs.length ? errs.slice(0, 5).join('\n') : 'none');
  await browser.close();
} finally {
  server.kill();
}
