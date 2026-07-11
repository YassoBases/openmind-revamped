// One-off smoke driver for number_city (run from shells/: node tools/nc_smoke.mjs [wrapper])
import { chromium } from '@playwright/test';
import { bootShell, bridgeEvents, debugState, driveUntil, loadSpec, tap } from '../test/driver.mjs';

const wrapper = process.argv[2] || 'nature';
const spec = loadSpec(`number_city_shapes_${wrapper}.ar.json`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 393, height: 851 } });
const errors = await bootShell(page, 'number_city', spec);

console.log('state after boot:', (await debugState(page)).state);
const t0 = Date.now();
try {
  await driveUntil(page, 'summary', { timeoutMs: 420000, stepDelay: 260 });
  console.log('reached summary in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  const done = (await debugState(page)).tappables.find((t) => t.id === 'done');
  if (done) await tap(page, done.x, done.y);
  await page.waitForTimeout(400);
  const events = await bridgeEvents(page);
  const names = events.filter((e) => e.type === 'reportEvent').map((e) => e.payload.name);
  console.log('learning events:', [...new Set(names)].filter(Boolean).join(', '));
  const attempts = events.filter((e) => e.type === 'reportEvent' && e.payload.name === 'attempt_submitted');
  console.log('attempts:', attempts.length,
    'beats:', JSON.stringify([...new Set(attempts.map((a) => a.payload.beat))]),
    'rungs:', JSON.stringify([...new Set(attempts.map((a) => a.payload.learningLevel))]));
  const summary = events.find((e) => e.type === 'reportSummary');
  console.log('summary:', JSON.stringify({
    presented: summary.payload.presented, correct: summary.payload.correct,
    recovered: summary.payload.recovered, xp: summary.payload.xp,
    kinds: [...new Set(summary.payload.items.map((i) => i.kind))],
  }));
} catch (e) {
  console.log('DRIVE FAILED:', e.message, 'state:', (await debugState(page)).state);
  await page.screenshot({ path: 'test-results/nc_smoke_stuck.png' });
}
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
