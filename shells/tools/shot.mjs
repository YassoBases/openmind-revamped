/**
 * Visual iteration driver: boots a shell in headless Chromium, optionally
 * performs scripted taps, and saves screenshots + console errors.
 *
 *   node tools/shot.mjs <game> <specFile> <outPrefix> [steps...]
 *
 * steps:  wait:MS | tap:ID (EduMindDebug tappable id) | tapxy:X,Y (game coords)
 *         shot:NAME | state (print debug state) | drag:ID>ID
 */
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shellsDir = join(here, '..');
const root = join(shellsDir, '..');

const [game, specFile, outPrefix, ...steps] = process.argv.slice(2);
if (!game || !specFile) {
  console.error('usage: node tools/shot.mjs <game> <specFile> <outPrefix> [steps...]');
  process.exit(1);
}

const SPEC_MARKER = '/*__EDUMIND_SPEC_JSON__*/null';
const shell = readFileSync(join(shellsDir, 'dist', `${game}.html`), 'utf8');
const spec = JSON.parse(readFileSync(join(root, 'samples', specFile), 'utf8'));
const html = shell.replace(SPEC_MARKER, JSON.stringify(spec).replace(/</g, '\\u003c'));

const outDir = join(shellsDir, 'tools', 'out');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 750 }, hasTouch: true });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(1800);

async function gameToClient(x, y) {
  return page.evaluate(([gx, gy]) => {
    const canvas = document.querySelector('canvas');
    const r = canvas.getBoundingClientRect();
    return { x: r.x + (gx / 720) * r.width, y: r.y + (gy / 1280) * r.height };
  }, [x, y]);
}

async function tapAt(x, y) {
  const p = await gameToClient(x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
}

let shotIdx = 0;
for (const step of steps) {
  const [cmd, arg] = step.split(':');
  if (cmd === 'until') {
    // autopilot-style: keep advancing until the named state is reached
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const dbg = await page.evaluate(() => ({
        state: window.EduMindDebug.state,
        tappables: window.EduMindDebug.tappables,
      }));
      if (dbg.state === arg) break;
      if (dbg.state === 'menu' && dbg.tappables[0]) await tapAt(dbg.tappables[0].x, dbg.tappables[0].y);
      else if (['tutorial', 'question'].includes(dbg.state) && dbg.tappables.length) {
        const t = dbg.tappables.find((x) => x.correct) || dbg.tappables[0];
        await tapAt(t.x, t.y);
      } else {
        await tapAt(360, 620);
        await page.waitForTimeout(120);
        await tapAt(360, 800);
      }
      await page.waitForTimeout(380);
    }
  }
  else if (cmd === 'wait') await page.waitForTimeout(+arg);
  else if (cmd === 'shot') {
    await page.screenshot({ path: join(outDir, `${outPrefix}_${String(++shotIdx).padStart(2, '0')}_${arg}.png`) });
  } else if (cmd === 'state') {
    const st = await page.evaluate(() => ({
      state: window.EduMindDebug.state,
      scene: window.EduMindDebug.sceneKey,
      tappables: window.EduMindDebug.tappables.map((t) => t.id + (t.correct ? '*' : '')),
      lastEvents: window.EduMindDebug.events.slice(-5).map((e) => e.type),
    }));
    console.log('[state]', JSON.stringify(st));
  } else if (cmd === 'tap') {
    const t = await page.evaluate((id) => window.EduMindDebug.tappables.find((x) => x.id === id), arg);
    if (!t) { console.log(`[tap] no tappable "${arg}" — state:`, await page.evaluate(() => window.EduMindDebug.state)); continue; }
    await tapAt(t.x, t.y);
  } else if (cmd === 'tapxy') {
    const [x, y] = arg.split(',').map(Number);
    await tapAt(x, y);
  } else if (cmd === 'tapcorrect' || cmd === 'tapwrong') {
    const want = cmd === 'tapcorrect';
    const t = await page.evaluate((w) => window.EduMindDebug.tappables.find((x) => !!x.correct === w), want);
    if (!t) { console.log(`[${cmd}] nothing tappable — state:`, await page.evaluate(() => window.EduMindDebug.state)); continue; }
    await tapAt(t.x, t.y);
  } else if (cmd === 'drag') {
    const [a, b] = arg.split('>');
    const ta = await page.evaluate((id) => window.EduMindDebug.tappables.find((x) => x.id === id), a);
    const tb = await page.evaluate((id) => window.EduMindDebug.tappables.find((x) => x.id === id), b);
    if (!ta || !tb) { console.log(`[drag] missing node ${a} or ${b}`); continue; }
    const pa = await gameToClient(ta.x, ta.y);
    const pb = await gameToClient(tb.x, tb.y);
    await page.mouse.move(pa.x, pa.y);
    await page.mouse.down();
    const N = 12;
    for (let i = 1; i <= N; i++) {
      await page.mouse.move(pa.x + ((pb.x - pa.x) * i) / N, pa.y + ((pb.y - pa.y) * i) / N);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
  }
}

await page.screenshot({ path: join(outDir, `${outPrefix}_final.png`) });
const dbg = await page.evaluate(() => ({
  state: window.EduMindDebug ? window.EduMindDebug.state : 'NO DEBUG',
  events: window.EduMindDebug ? window.EduMindDebug.events.map((e) => e.type) : [],
}));
console.log('[final]', JSON.stringify(dbg));
if (errors.length) {
  console.log('[errors]');
  errors.slice(0, 12).forEach((e) => console.log('  ' + e.slice(0, 400)));
} else {
  console.log('[errors] none');
}
await browser.close();
