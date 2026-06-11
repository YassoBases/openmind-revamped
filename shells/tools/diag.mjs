import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shellsDir = join(here, '..');
const root = join(shellsDir, '..');
const shell = readFileSync(join(shellsDir, 'dist', 'quest_path.html'), 'utf8');
const spec = JSON.parse(readFileSync(join(root, 'samples', 'quest_path_water_cycle.en.json'), 'utf8'));
const html = shell.replace('/*__EDUMIND_SPEC_JSON__*/null', JSON.stringify(spec).replace(/</g, '\\u003c'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 750 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(2000);

await page.evaluate(() => {
  window.__taps = [];
  window.addEventListener('pointerdown', (e) => window.__taps.push(['down', e.clientX, e.clientY]));
  window.addEventListener('pointerup', (e) => window.__taps.push(['up', e.clientX, e.clientY]));
});

const info = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  return { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, tappables: window.EduMindDebug.tappables };
});
console.log('canvas', JSON.stringify(info));

const t = info.tappables[0];
const cx = info.rect.x + (t.x / 720) * info.rect.w;
const cy = info.rect.y + (t.y / 1280) * info.rect.h;
console.log('clicking at', cx, cy);
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.waitForTimeout(80);
await page.mouse.up();
await page.waitForTimeout(1200);

console.log('taps seen:', JSON.stringify(await page.evaluate(() => window.__taps)));
console.log('state:', await page.evaluate(() => window.EduMindDebug.state));
console.log('renderer:', await page.evaluate(() => EduCore.game.renderer.constructor.name));
await browser.close();
