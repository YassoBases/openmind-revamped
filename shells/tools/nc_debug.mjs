// Debug the tutorial tap path (run from shells/)
import { chromium } from '@playwright/test';
import { bootShell, debugState, stepOnce, tap, loadSpec } from '../test/driver.mjs';

const spec = loadSpec('number_city_shapes_nature.ar.json');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 393, height: 851 } });
await bootShell(page, 'number_city', spec);

// menu → tutorial
for (let i = 0; i < 30; i++) {
  const dbg = await debugState(page);
  if (dbg.state === 'tutorial' && dbg.tappables.length) break;
  await stepOnce(page);
  await page.waitForTimeout(300);
}
const dbg = await debugState(page);
console.log('state:', dbg.state, 'tappables:', JSON.stringify(dbg.tappables));

// try tapping the correct one and see what happens
const correct = dbg.tappables.find((t) => t.correct);
if (correct) {
  const before = await page.evaluate(() => window.EduMindDebug.events.length);
  await tap(page, correct.x, correct.y);
  await page.waitForTimeout(600);
  const after = await page.evaluate(() =>
    window.EduMindDebug.events.slice(-4).map((e) => e.type + ':' + (e.payload && e.payload.name || '')));
  console.log('events before:', before, 'last events:', after);
  console.log('state now:', (await debugState(page)).state);
}
await page.screenshot({ path: 'test-results/nc_debug.png' });
await browser.close();
