/**
 * Autopilot: plays a full shell session end-to-end by reading EduMindDebug
 * state and acting like a (fast) student. Used for polish iteration and as
 * the engine behind the behavioral test suite.
 *
 *   node tools/autopilot.mjs <game> <specFile> [--wrong-every=N] [--shots=PREFIX]
 *                            [--stub] [--deliver-after=MS] [--timeout=MS]
 *
 * Exits 0 when the summary screen is reached and DONE is tapped.
 */
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shellsDir = join(here, '..');
const root = join(shellsDir, '..');

const args = process.argv.slice(2);
const [game, specFile] = args;
const opt = (name, dflt) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : dflt;
};
const wrongEvery = +opt('wrong-every', 0); // answer wrongly every Nth question
const shots = opt('shots', null);
const useStub = args.includes('--stub');
const deliverAfter = +opt('deliver-after', 4000);
const timeoutMs = +opt('timeout', 150000);

const SPEC_MARKER = '/*__EDUMIND_SPEC_JSON__*/null';
const shell = readFileSync(join(shellsDir, 'dist', `${game}.html`), 'utf8');
const spec = JSON.parse(readFileSync(join(root, 'samples', specFile), 'utf8'));
const injected = useStub
  ? { specVersion: 1, stub: true, meta: spec.meta, student: spec.student, levels: [] }
  : spec;
const html = shell.replace(SPEC_MARKER, JSON.stringify(injected).replace(/</g, '\\u003c'));

const outDir = join(shellsDir, 'tools', 'out');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 750 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(1500);

if (useStub) {
  setTimeout(() => {
    page.evaluate((s) => window.EduCore.receiveSpec(s), spec).catch(() => {});
  }, deliverAfter);
}

async function toClient(x, y) {
  return page.evaluate(([gx, gy]) => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { x: r.x + (gx / 720) * r.width, y: r.y + (gy / 1280) * r.height };
  }, [x, y]);
}
async function tap(x, y) {
  const p = await toClient(x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.up();
}
async function drag(ax, ay, bx, by) {
  const a = await toClient(ax, ay);
  const b = await toClient(bx, by);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / 10, a.y + ((b.y - a.y) * i) / 10);
    await page.waitForTimeout(14);
  }
  await page.mouse.up();
}

let questionCount = 0;
let shotIdx = 0;
const seenStates = new Set();
const start = Date.now();
let done = false;
let lastState = '';
let stuckSince = Date.now();

while (!done && Date.now() - start < timeoutMs) {
  const dbg = await page.evaluate(() => ({
    state: window.EduMindDebug.state,
    scene: window.EduMindDebug.sceneKey,
    tappables: window.EduMindDebug.tappables,
    connect: window.EduMindDebug.getConnect ? window.EduMindDebug.getConnect() : null,
    drag: window.EduMindDebug.getDrag ? window.EduMindDebug.getDrag() : null,
    eventTypes: [...new Set(window.EduMindDebug.events.map((e) => e.type))],
  }));

  if (dbg.state !== lastState) {
    console.log(`[ap] state=${dbg.state} t=${((Date.now() - start) / 1000).toFixed(1)}s`);
    lastState = dbg.state;
    stuckSince = Date.now();
    if (shots && !seenStates.has(dbg.state)) {
      seenStates.add(dbg.state);
      await page.waitForTimeout(450);
      await page.screenshot({ path: join(outDir, `${shots}_${String(++shotIdx).padStart(2, '0')}_${dbg.state}.png`) });
    }
  }

  switch (dbg.state) {
    case 'menu': {
      const play = dbg.tappables.find((t) => t.id === 'play');
      if (play) await tap(play.x, play.y);
      break;
    }
    case 'levelStart':
    case 'levelEnd':
    case 'feedback':
    case 'observe':
    case 'notice':
      await tap(360, 620);
      break;
    case 'teach':
      await tap(360, 800); // first tap skips typewriter, second advances
      await page.waitForTimeout(250);
      await tap(360, 800);
      break;
    case 'tutorial':
    case 'question': {
      if (dbg.connect && dbg.connect.length) {
        const c = dbg.connect[0];
        await drag(c.ax, c.ay, c.bx, c.by);
        break;
      }
      if (dbg.drag && dbg.drag.length) {
        const d = dbg.drag[0];
        await drag(d.ax, d.ay, d.bx, d.by);
        break;
      }
      if (dbg.tappables.length) {
        questionCount++;
        const goWrong = wrongEvery > 0 && questionCount % wrongEvery === 0;
        const target =
          dbg.tappables.find((t) => (goWrong ? !t.correct : t.correct)) || dbg.tappables[0];
        await tap(target.x, target.y);
        await page.waitForTimeout(300);
      } else {
        // advance whichever dialog zone is active (QP ~800, GS ~1010, DC ~1060),
        // re-checking between taps so we never blind-tap onto freshly spawned options
        for (const y of [800, 1010, 1060]) {
          await tap(360, y);
          await page.waitForTimeout(220);
          const has = await page.evaluate(() =>
            window.EduMindDebug.tappables.length > 0 ||
            (window.EduMindDebug.getConnect && window.EduMindDebug.getConnect().length > 0));
          if (has) break;
        }
      }
      break;
    }
    case 'break':
    case 'waiting':
      // breathing room scene / spec wait — just idle, button taps handled below
      if (dbg.tappables.length) await tap(dbg.tappables[0].x, dbg.tappables[0].y);
      else await tap(360, 1100); // "let's continue" candy button area
      break;
    case 'summary': {
      await page.waitForTimeout(800);
      if (shots) await page.screenshot({ path: join(outDir, `${shots}_summary_full.png`) });
      const doneBtn = dbg.tappables.find((t) => t.id === 'done');
      if (doneBtn) await tap(doneBtn.x, doneBtn.y);
      await page.waitForTimeout(400);
      done = true;
      break;
    }
    default:
      break;
  }

  if (Date.now() - stuckSince > 25000) {
    console.log(`[ap] STUCK in state=${dbg.state} — aborting`);
    if (shots) await page.screenshot({ path: join(outDir, `${shots}_stuck_${dbg.state}.png`) });
    break;
  }
  await page.waitForTimeout(350);
}

const finalDbg = await page.evaluate(() => ({
  scores: window.EduMindDebug.events
    .filter((e) => e.type === 'reportScore')
    .map((e) => `${e.payload.itemId}:${e.payload.wasCorrect ? 'OK' : 'X'}h${e.payload.hintsUsed}`),
  events: [...new Set(window.EduMindDebug.events.map((e) => e.type))],
  summary: window.EduCore.lastSummary
    ? {
        xp: window.EduCore.lastSummary.xp,
        accuracy: window.EduCore.lastSummary.accuracy,
        mastery: window.EduCore.lastSummary.mastery,
        presented: window.EduCore.lastSummary.presented,
      }
    : null,
}));
console.log('[ap] bridge calls:', finalDbg.events.join(', '));
console.log('[ap] answers:', finalDbg.scores.join(' '));
console.log('[ap] summary:', JSON.stringify(finalDbg.summary));
console.log('[ap] errors:', errors.length ? errors.slice(0, 8).join('\n  ') : 'none');
await browser.close();
process.exit(done && !errors.length ? 0 : 1);
