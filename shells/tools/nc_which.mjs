import { chromium } from '@playwright/test';
import { bootShell, bridgeEvents, driveUntil, loadSpec } from '../test/driver.mjs';
const spec = loadSpec('number_city_shapes_nature.ar.json');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 393, height: 851 } });
await bootShell(page, 'number_city', spec);
await driveUntil(page, 'summary', { timeoutMs: 420000, stepDelay: 260 });
const events = await bridgeEvents(page);
const summary = events.find((e) => e.type === 'reportSummary').payload;
for (const it of summary.items) {
  if (!it.correct) console.log('NOT-FIRST-TRY:', JSON.stringify(it));
}
const oi = events.filter((e) => e.type === 'reportEvent' && e.payload.name === 'object_interacted');
console.log('interactions on that item:',
  JSON.stringify(oi.filter((e) => e.payload.itemId === summary.items.find((i) => !i.correct)?.id)
    .map((e) => e.payload.objectId)));
await browser.close();
