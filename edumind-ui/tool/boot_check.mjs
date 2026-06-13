import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const PORT = 5091;
const server = spawn(process.execPath, [join(here, 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 460, height: 880 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: join(here, 'boot_noseed.png') });
  console.log('NOSEED errors:', errs.length ? errs.slice(0,4).join('\n') : 'none');
  await browser.close();
} finally { server.kill(); }
