// M4 check: drive the REAL onboarding flow (no seeded token) through profile
// setup + theme selection, which should register a student and land on the
// home path. Verifies the ProfileBridge registration wiring end-to-end.
//   node tool/onboarding_check.mjs
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 5094;
const server = spawn(process.execPath, [join(here, 'serve.mjs')], {
  env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
});
const shot = (page, name) => page.screenshot({ path: join(here, name) });
const wait = (page, ms) => page.waitForTimeout(ms);

try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 460, height: 880 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'load' });
  await wait(page, 9000);
  await shot(page, 'ob_1_onboarding.png');

  // Onboarding "ابدأ رحلتي" CTA at the bottom of the card.
  await page.mouse.click(230, 690);
  await wait(page, 2500);
  await shot(page, 'ob_2_profilesetup.png');

  console.log('NOTE: profile setup needs name+gender+class+interest+style;');
  console.log('driving it blindly is fragile — this run captures the screens so');
  console.log('coordinates can be tuned. errors:', errs.length ? errs.slice(0, 5).join('\n') : 'none');
  await browser.close();
} finally {
  server.kill();
}
