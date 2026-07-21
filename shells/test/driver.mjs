/**
 * Shared Playwright driver for shell behavioral tests — the same logic the
 * polish autopilot uses, packaged for @playwright/test.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shellsDir = join(here, '..');
const root = join(shellsDir, '..');

export const SPEC_MARKER = '/*__EDUMIND_SPEC_JSON__*/null';

export function loadSpec(specFile) {
  return JSON.parse(readFileSync(join(root, 'samples', specFile), 'utf8'));
}

export function buildHtml(game, spec) {
  // The unified shell hosts every game; spec.meta.gameType selects the module.
  const shell = readFileSync(join(shellsDir, 'dist', 'edumind.html'), 'utf8');
  return shell.replace(SPEC_MARKER, JSON.stringify(spec).replace(/</g, '\\u003c'));
}

export function stubOf(spec) {
  return { specVersion: 1, stub: true, meta: spec.meta, student: spec.student, levels: [] };
}

// Headless-GPU noise that is not an application error (varies per machine/run).
const BENIGN_CONSOLE = /WebGL|GPU|GroupMarker|SwiftShader|swiftshader|Automatic fallback|fallback to software|VSync|gl_|ANGLE/i;

export async function bootShell(page, game, spec) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !BENIGN_CONSOLE.test(m.text())) errors.push(m.text());
  });
  await page.setContent(buildHtml(game, spec), { waitUntil: 'load' });
  await page.waitForTimeout(1600);
  return errors;
}

export async function debugState(page) {
  return page.evaluate(() => ({
    state: window.EduMindDebug.state,
    scene: window.EduMindDebug.sceneKey,
    tappables: window.EduMindDebug.tappables,
    connect: window.EduMindDebug.getConnect ? window.EduMindDebug.getConnect() : null,
    drag: window.EduMindDebug.getDrag ? window.EduMindDebug.getDrag() : null,
  }));
}

export async function tap(page, gx, gy) {
  const p = await page.evaluate(([x, y]) => {
    const r = document.querySelector('#game-container canvas').getBoundingClientRect();
    return { x: r.x + (x / 720) * r.width, y: r.y + (y / 1280) * r.height };
  }, [gx, gy]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.up();
}

export async function drag(page, ax, ay, bx, by) {
  const a = await page.evaluate(([x, y]) => {
    const r = document.querySelector('#game-container canvas').getBoundingClientRect();
    return { x: r.x + (x / 720) * r.width, y: r.y + (y / 1280) * r.height };
  }, [ax, ay]);
  const b = await page.evaluate(([x, y]) => {
    const r = document.querySelector('#game-container canvas').getBoundingClientRect();
    return { x: r.x + (x / 720) * r.width, y: r.y + (y / 1280) * r.height };
  }, [bx, by]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / 10, a.y + ((b.y - a.y) * i) / 10);
    await page.waitForTimeout(14);
  }
  await page.mouse.up();
}

/** One autopilot step: act on the current state. Returns the state seen. */
export async function stepOnce(page, opts = {}) {
  const dbg = await debugState(page);
  switch (dbg.state) {
    case 'menu': {
      const play = dbg.tappables.find((t) => t.id === 'play');
      if (play) await tap(page, play.x, play.y);
      break;
    }
    case 'levelStart':
    case 'levelEnd':
    case 'feedback':
    case 'observe': // six-beat watch/notice moments dismiss with a tap
    case 'notice':
      await tap(page, 360, 620);
      break;
    case 'teach':
      await tap(page, 360, 800);
      await page.waitForTimeout(220);
      await tap(page, 360, 800);
      break;
    case 'tutorial':
    case 'question': {
      if (dbg.connect && dbg.connect.length) {
        const c = dbg.connect[0];
        await drag(page, c.ax, c.ay, c.bx, c.by);
        break;
      }
      if (dbg.drag && dbg.drag.length) {
        const d = dbg.drag[0];
        await drag(page, d.ax, d.ay, d.bx, d.by);
        break;
      }
      if (dbg.tappables.length) {
        const wantCorrect = opts.answer !== 'wrong';
        const t = dbg.tappables.find((x) => !!x.correct === wantCorrect) || dbg.tappables[0];
        await tap(page, t.x, t.y);
        if (opts.onAnswered) opts.onAnswered();
      } else {
        for (const y of [800, 1010, 1060]) {
          await tap(page, 360, y);
          await page.waitForTimeout(200);
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
      await tap(page, 360, 1100);
      break;
    default:
      break;
  }
  return dbg.state;
}

/** Drive until a target state (or one of several) is reached. */
export async function driveUntil(page, target, opts = {}) {
  const targets = Array.isArray(target) ? target : [target];
  const deadline = Date.now() + (opts.timeoutMs || 90000);
  while (Date.now() < deadline) {
    const dbg = await debugState(page);
    if (targets.includes(dbg.state)) return dbg.state;
    await stepOnce(page, opts);
    await page.waitForTimeout(opts.stepDelay || 320);
  }
  throw new Error(`driveUntil(${targets.join('|')}) timed out in state "${(await debugState(page)).state}"`);
}

export async function bridgeEvents(page) {
  return page.evaluate(() => window.EduMindDebug.events.map((e) => ({ type: e.type, payload: e.payload })));
}
