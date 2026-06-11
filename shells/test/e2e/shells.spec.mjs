/**
 * Shell CI — behavioral tests (Playwright, mobile emulation).
 *
 * Per shell × golden spec: boots, completes the intro tutorial, exercises a
 * correct and a wrong answer, observes all bridge events, verifies RTL HUD
 * swap for Arabic, the progressive-start stub flow, and the static-frame
 * "alive, not static" mandate (two screenshots 2s apart must differ in every
 * scene).
 */
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import {
  bootShell, bridgeEvents, debugState, driveUntil, loadSpec, stepOnce, stubOf, tap,
} from '../driver.mjs';

const RUNS = [
  { game: 'quest_path', spec: 'quest_path_water_cycle.en.json' },
  { game: 'goal_shootout', spec: 'goal_shootout_world_capitals.en.json' },
  { game: 'draw_connect', spec: 'draw_connect_plant_cell.en.json' },
  { game: 'quest_path', spec: 'quest_path_water_cycle.ar.json', rtl: true },
];

function diffPixels(bufA, bufB) {
  const a = PNG.sync.read(bufA);
  const b = PNG.sync.read(bufB);
  if (a.width !== b.width || a.height !== b.height) return Number.MAX_SAFE_INTEGER;
  let diff = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs(a.data[i] - b.data[i]) > 8 ||
      Math.abs(a.data[i + 1] - b.data[i + 1]) > 8 ||
      Math.abs(a.data[i + 2] - b.data[i + 2]) > 8
    ) diff++;
  }
  return diff;
}

async function expectAlive(page, label) {
  // Phaser creates extra small canvases for RTL text measurement — target the game one.
  const canvas = page.locator('#game-container canvas[width="720"]').first();
  const s1 = await canvas.screenshot();
  await page.waitForTimeout(2000);
  const s2 = await canvas.screenshot();
  const diff = diffPixels(s1, s2);
  expect(diff, `static-frame: "${label}" changed only ${diff} px over 2s`).toBeGreaterThan(150);
}

for (const run of RUNS) {
  test(`${run.game} / ${run.spec}: full session with mixed answers`, async ({ page }) => {
    const spec = loadSpec(run.spec);
    const errors = await bootShell(page, run.game, spec);

    // menu reached, html direction correct
    expect((await debugState(page)).state).toBe('menu');
    const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
    expect(dir).toBe(run.rtl ? 'rtl' : 'ltr');
    await expectAlive(page, 'menu');

    if (run.rtl) {
      // RTL HUD swap: after entering the game, hearts sit on the LEFT
      await driveUntil(page, ['tutorial', 'teach', 'question'], { timeoutMs: 60000 });
      const heartsX = await page.evaluate(() =>
        EduCore.game.scene.getScene('GameScene').heartIcons.map((h) => h.x));
      expect(Math.max(...heartsX)).toBeLessThan(360);
      await page.screenshot({ path: 'test-results/rtl-sanity.png' });
    }

    // intro tutorial completes without educational content
    await driveUntil(page, 'teach', { timeoutMs: 90000 });
    const events1 = await bridgeEvents(page);
    const levelEvents = events1.filter((e) => e.type === 'reportLevel');
    expect(levelEvents.length).toBeGreaterThanOrEqual(1); // tutorial level reported
    expect(events1.filter((e) => e.type === 'reportScore').length).toBe(0); // no scoring in tutorial

    await expectAlive(page, 'teach');

    // first practice item: answer WRONG → heart lost, gentle feedback, explanation
    await driveUntil(page, 'question', { timeoutMs: 60000 });
    await expectAlive(page, 'question');
    let answered = false;
    const wrongDeadline = Date.now() + 60000;
    while (!answered && Date.now() < wrongDeadline) {
      const before = (await bridgeEvents(page)).filter((e) => e.type === 'reportScore').length;
      await stepOnce(page, { answer: 'wrong' });
      await page.waitForTimeout(700);
      const scores = (await bridgeEvents(page)).filter((e) => e.type === 'reportScore');
      if (scores.length > before) {
        answered = true;
        const last = scores[scores.length - 1].payload;
        if (run.game === 'draw_connect') {
          // connect items cannot be answered wrong by tap; driver always connects
          expect(last.wasCorrect).toBe(true);
        } else {
          expect(last.wasCorrect).toBe(false);
          expect(last.combo).toBe(0);
        }
      }
    }
    expect(answered, 'never managed to answer an item').toBe(true);
    await driveUntil(page, 'feedback', { timeoutMs: 30000 }).catch(() => {});
    await expectAlive(page, 'feedback (explanation)');

    // play to the summary answering correctly
    await driveUntil(page, 'summary', { timeoutMs: 150000 });
    await expectAlive(page, 'summary');

    const events = await bridgeEvents(page);
    const types = new Set(events.map((e) => e.type));
    for (const t of ['reportScore', 'reportLevel', 'reportSummary', 'reportComplete', 'reportEvent']) {
      if (t === 'reportComplete') continue; // fired on DONE below
      expect(types.has(t), `missing bridge call ${t}`).toBe(true);
    }
    const summary = events.find((e) => e.type === 'reportSummary').payload;
    expect(summary.presented).toBeGreaterThan(0);
    expect(summary.items.length).toBe(summary.presented);
    expect(summary.xp).toBeGreaterThan(0);

    // DONE fires reportComplete
    const done = (await debugState(page)).tappables.find((t) => t.id === 'done');
    await tap(page, done.x, done.y);
    await page.waitForTimeout(500);
    const completes = (await bridgeEvents(page)).filter((e) => e.type === 'reportComplete');
    expect(completes.length).toBe(1);

    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
  });
}

test('progressive start: stub boots, waiting room, hot-loaded spec, full session', async ({ page }) => {
  const spec = loadSpec('quest_path_water_cycle.en.json');
  const errors = await bootShell(page, 'quest_path', stubOf(spec));

  expect((await debugState(page)).state).toBe('menu');
  expect(await page.evaluate(() => window.EduMindDebug.specReady)).toBe(false);

  // deliver the full spec mid-tutorial via the host postMessage channel
  setTimeout(() => {
    page.evaluate((s) => {
      window.postMessage({ source: 'EduMindHost', type: 'spec', payload: s }, '*');
    }, spec).catch(() => {});
  }, 9000);

  // drive; the shell should pass through (or skip) the waiting room and finish
  await driveUntil(page, 'summary', { timeoutMs: 180000 });
  expect(await page.evaluate(() => window.EduMindDebug.specReady)).toBe(true);

  const events = await bridgeEvents(page);
  expect(events.some((e) => e.type === 'reportEvent' && e.payload.name === 'spec_received')).toBe(true);
  expect(errors).toEqual([]);
});

test('generation failure: mascot apology + retry event', async ({ page }) => {
  const spec = loadSpec('goal_shootout_world_capitals.en.json');
  await bootShell(page, 'goal_shootout', stubOf(spec));

  await page.evaluate(() => {
    window.postMessage({ source: 'EduMindHost', type: 'generationFailed' }, '*');
  });

  // finish the tutorial; instead of educational levels we should land on "failed"
  await driveUntil(page, 'failed', { timeoutMs: 90000 });
  await expectAlive(page, 'failed (apology)');

  // the retry candy button reports retry_requested to the host
  await tap(page, 360, 1280 * 0.72);
  await page.waitForTimeout(400);
  const events = await bridgeEvents(page);
  expect(events.some((e) => e.type === 'reportEvent' && e.payload.name === 'retry_requested')).toBe(true);
});

test('waiting room appears when the spec is late and shows living tips', async ({ page }) => {
  const spec = loadSpec('draw_connect_plant_cell.en.json');
  await bootShell(page, 'draw_connect', stubOf(spec));

  await driveUntil(page, 'waiting', { timeoutMs: 90000 });
  await expectAlive(page, 'waiting room');

  await page.evaluate((s) => {
    window.postMessage({ source: 'EduMindHost', type: 'spec', payload: s }, '*');
  }, spec);
  await driveUntil(page, ['teach', 'question'], { timeoutMs: 30000 });
});
