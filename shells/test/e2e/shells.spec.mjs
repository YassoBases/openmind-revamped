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
  // Mechanic variants: same specs, different staging. All four keep tappable
  // options (draw_pass via its fallback), so the standard driver plays full
  // sessions through each.
  { game: 'goal_shootout', spec: 'goal_shootout_world_capitals_drawpass.en.json' },
  { game: 'quest_path', spec: 'quest_path_water_cycle_bridge.en.json' },
  { game: 'goal_shootout', spec: 'goal_shootout_world_capitals_keeper.en.json' },
  { game: 'quest_path', spec: 'quest_path_water_cycle_lanterns.en.json' },
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
      // RTL HUD swap: after entering the game, the XP pill sits on the RIGHT
      await driveUntil(page, ['tutorial', 'teach', 'question'], { timeoutMs: 60000 });
      const xpX = await page.evaluate(() =>
        EduCore.game.scene.getScene('GameScene').hudXpText.x);
      expect(xpX).toBeGreaterThan(360);
      await page.screenshot({ path: 'test-results/rtl-sanity.png' });
    }

    // intro tutorial completes without educational content
    await driveUntil(page, 'teach', { timeoutMs: 90000 });
    const events1 = await bridgeEvents(page);
    const levelEvents = events1.filter((e) => e.type === 'reportLevel');
    expect(levelEvents.length).toBeGreaterThanOrEqual(1); // tutorial level reported
    expect(events1.filter((e) => e.type === 'reportScore').length).toBe(0); // no scoring in tutorial

    await expectAlive(page, 'teach');

    // first practice item: keep answering WRONG → supportive retries with
    // auto-hints (no hearts, nothing lost), then a supported reveal resolves
    // the item as not-first-try-correct
    await driveUntil(page, 'question', { timeoutMs: 60000 });
    await expectAlive(page, 'question');
    let answered = false;
    const wrongDeadline = Date.now() + 120000; // retries make items longer on slow GL
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
          expect(last.attempts).toBeGreaterThan(1); // the retries really ran
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

    // the 8-event learning contract rides reportEvent with the shared envelope
    const learningNames = new Set(
      events.filter((e) => e.type === 'reportEvent').map((e) => e.payload.name));
    for (const ev of ['experience_started', 'attempt_submitted', 'level_completed', 'experience_completed']) {
      expect(learningNames.has(ev), `missing learning event ${ev}`).toBe(true);
    }
    const attemptEv = events.find(
      (e) => e.type === 'reportEvent' && e.payload.name === 'attempt_submitted').payload;
    expect(attemptEv.templateId).toBe(run.game);
    expect(attemptEv.wrapperId).toBeTruthy(); // theme doubles as the wrapper id today
    expect(attemptEv.attempt).toBeGreaterThanOrEqual(1);

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

test('number_city (AR): six-beat ladder session, wrong tap recovers, envelope carries rung+beat', async ({ page }) => {
  const spec = loadSpec('number_city_shapes_nature.ar.json');
  const errors = await bootShell(page, 'number_city', spec);

  expect((await debugState(page)).state).toBe('menu');
  expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('rtl');
  await expectAlive(page, 'menu');

  // RTL HUD swap once in the game
  await driveUntil(page, ['tutorial', 'observe', 'question'], { timeoutMs: 60000 });
  const xpX = await page.evaluate(() => EduCore.game.scene.getScene('GameScene').hudXpText.x);
  expect(xpX).toBeGreaterThan(360);

  // reach the first real item, wait for the scene objects to arm, then tap a
  // deliberate distractor — nothing is lost, the item completes as recovered
  await driveUntil(page, 'question', { timeoutMs: 90000 });
  let tappables = [];
  const armDeadline = Date.now() + 30000;
  while (Date.now() < armDeadline) {
    tappables = (await debugState(page)).tappables;
    if (tappables.length) break;
    await stepOnce(page);
    await page.waitForTimeout(300);
  }
  const distractor = tappables.find((t) => !t.correct);
  expect(distractor, 'first item exposes a distractor').toBeTruthy();
  await page.waitForTimeout(700); // objects arm shortly after spawn
  await tap(page, distractor.x, distractor.y);
  await page.waitForTimeout(400);
  await expectAlive(page, 'question');

  // drive the rest of the session correctly
  await driveUntil(page, 'summary', { timeoutMs: 300000 });
  await expectAlive(page, 'summary');

  const events = await bridgeEvents(page);
  const attempts = events
    .filter((e) => e.type === 'reportEvent' && e.payload.name === 'attempt_submitted')
    .map((e) => e.payload);
  expect(attempts.length).toBe(12); // 4 ladder levels x (try + practice + checkpoint)
  for (const a of attempts) {
    expect(['try', 'practice', 'checkpoint']).toContain(a.beat);
    expect(['recognize', 'understand', 'apply', 'challenge']).toContain(a.learningLevel);
    expect(a.templateId).toBe('number_city');
    expect(a.wrapperId).toBe('nature');
    expect(a.conceptId).toBe('shapes_around_us_g1');
  }
  expect(new Set(attempts.map((a) => a.learningLevel)).size).toBe(4); // the full ladder ran
  expect(new Set(attempts.map((a) => a.beat)).size).toBe(3);

  // the wrong-tapped item completed as recovered — never failed, never punished
  const scores = events.filter((e) => e.type === 'reportScore').map((e) => e.payload);
  const stumbled = scores.find((sc) => sc.wasCorrect === false);
  expect(stumbled, 'the deliberate wrong tap shows up in scoring').toBeTruthy();
  expect(stumbled.recovered).toBe(true);

  // summary rows carry the item kind (feeds kind-aware evidence server-side)
  const summary = events.find((e) => e.type === 'reportSummary').payload;
  const kinds = new Set(summary.items.map((i) => i.kind));
  expect(kinds).toEqual(new Set(['tap_scene', 'drag_collect', 'sequence', 'build_complete']));

  const done = (await debugState(page)).tappables.find((t) => t.id === 'done');
  await tap(page, done.x, done.y);
  await page.waitForTimeout(500);
  expect((await bridgeEvents(page)).filter((e) => e.type === 'reportComplete').length).toBe(1);

  expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
});

test('scene_play (EN): living-scene ladder session exercises all four templates', async ({ page }) => {
  const spec = loadSpec('scene_play_simple_machines.en.json');
  const errors = await bootShell(page, 'scene_play', spec);

  expect((await debugState(page)).state).toBe('menu');
  await expectAlive(page, 'menu');

  // reach the first real item and stumble once on purpose — nothing is lost
  await driveUntil(page, 'question', { timeoutMs: 120000 });
  await expectAlive(page, 'question');
  let tappables = [];
  const armDeadline = Date.now() + 30000;
  while (Date.now() < armDeadline) {
    tappables = (await debugState(page)).tappables;
    if (tappables.length) break;
    await stepOnce(page);
    await page.waitForTimeout(300);
  }
  expect(tappables.length).toBeGreaterThan(0);

  // drive the rest of the session correctly to the summary
  await driveUntil(page, 'summary', { timeoutMs: 300000 });
  await expectAlive(page, 'summary');

  const events = await bridgeEvents(page);
  const attempts = events
    .filter((e) => e.type === 'reportEvent' && e.payload.name === 'attempt_submitted')
    .map((e) => e.payload);
  expect(attempts.length).toBe(12); // 4 ladder levels x (try + practice + checkpoint)
  for (const a of attempts) {
    expect(['try', 'practice', 'checkpoint']).toContain(a.beat);
    expect(['recognize', 'understand', 'apply', 'challenge']).toContain(a.learningLevel);
    expect(a.templateId).toBe('scene_play');
    expect(a.wrapperId).toBe('construction');
    expect(a.conceptId).toBe('simple_machines_g2');
  }
  expect(new Set(attempts.map((a) => a.learningLevel)).size).toBe(4); // the full ladder ran

  // the summary carries the scene kinds, including the expressive creation
  const summary = events.find((e) => e.type === 'reportSummary').payload;
  const kinds = new Set(summary.items.map((i) => i.kind));
  for (const k of ['rotation_transform', 'cause_effect', 'find_fix', 'create_express']) {
    expect(kinds.has(k), `session never presented ${k}`).toBe(true);
  }

  // creation is celebrated, never scored: expressive rows exist but are
  // excluded from the accuracy denominator (presented < item rows)
  const expressive = summary.items.filter((i) => i.expressive);
  expect(expressive.length).toBeGreaterThanOrEqual(1);
  expect(summary.presented).toBe(summary.items.length - expressive.length);
  for (const row of expressive) {
    expect(row.scored).toBe(false);
    expect(row.correct).toBe(false); // never counts toward mastery
  }
  const expressiveAttempts = attempts.filter((a) => a.outcome === 'completed');
  expect(expressiveAttempts.length).toBe(expressive.length);

  const done = (await debugState(page)).tappables.find((t) => t.id === 'done');
  await tap(page, done.x, done.y);
  await page.waitForTimeout(500);
  expect((await bridgeEvents(page)).filter((e) => e.type === 'reportComplete').length).toBe(1);

  expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
});

test('scene_play kit equivalence: the same spec re-skinned by kit keeps identical learning data', async ({ page, context }) => {
  async function firstQuestion(pg, wrapper) {
    const spec = loadSpec('scene_play_simple_machines.en.json');
    spec.meta.wrapper = wrapper; // kits are presentation-only — swap freely
    await bootShell(pg, 'scene_play', spec);
    await driveUntil(pg, 'question', { timeoutMs: 120000 });
    let tappables = [];
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      tappables = (await debugState(pg)).tappables;
      if (tappables.length) break;
      await stepOnce(pg);
      await pg.waitForTimeout(300);
    }
    const prompt = await pg.evaluate(() => EduCore.game.scene.getScene('GameScene').promptText.text);
    return {
      prompt,
      answers: tappables.map((t) => ({ id: t.id, correct: !!t.correct }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
  }

  const ocean = await firstQuestion(page, 'ocean');
  const page2 = await context.newPage();
  const space = await firstQuestion(page2, 'space');
  await page2.close();

  expect(space.prompt).toEqual(ocean.prompt);
  expect(space.answers).toEqual(ocean.answers);
});

test('wrapper equivalence: nature and construction present identical learning data', async ({ page, context }) => {
  // the golden specs are byte-identical except meta.wrapper (asserted in
  // shared tests); here we check the SHELL keeps the seam: same first item,
  // same prompt, same correctness map — only presentation differs
  async function firstQuestion(pg, wrapper) {
    const spec = loadSpec(`number_city_shapes_${wrapper}.ar.json`);
    await bootShell(pg, 'number_city', spec);
    await driveUntil(pg, 'question', { timeoutMs: 120000 });
    let tappables = [];
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      tappables = (await debugState(pg)).tappables;
      if (tappables.length) break;
      await stepOnce(pg);
      await pg.waitForTimeout(300);
    }
    const prompt = await pg.evaluate(() => EduCore.game.scene.getScene('GameScene').promptText.text);
    return {
      prompt,
      answers: tappables.map((t) => ({ id: t.id, correct: !!t.correct }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
  }

  const nature = await firstQuestion(page, 'nature');
  const page2 = await context.newPage();
  const construction = await firstQuestion(page2, 'construction');
  await page2.close();

  expect(construction.prompt).toEqual(nature.prompt);
  expect(construction.answers).toEqual(nature.answers);
  expect(nature.answers.some((a) => a.correct)).toBe(true);
  expect(nature.answers.some((a) => !a.correct)).toBe(true);
});

test('sort_streams variant: the classify board renders with bins and draggable chips', async ({ page }) => {
  // Drag-only mechanic — a boot + first-question smoke: the board must
  // expose its chips (with bin targets) on the drag debug surface.
  const spec = loadSpec('draw_connect_plant_cell_sort.en.json');
  const errors = await bootShell(page, 'draw_connect', spec);
  await driveUntil(page, 'question', { timeoutMs: 60000 });
  // The board builds after the prompt typewriter — poll, don't fixed-wait.
  let drag = null;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    drag = await page.evaluate(() =>
      window.EduMindDebug.getDrag ? window.EduMindDebug.getDrag() : null);
    if (drag && drag.chips && drag.chips.length > 0) break;
    await page.waitForTimeout(400);
  }
  expect(drag, 'sort board exposes its drag surface').toBeTruthy();
  expect(drag.chips.length, 'chips waiting to be sorted').toBeGreaterThan(0);
  for (const chip of drag.chips) {
    expect(chip.targetX, 'every chip knows its bin').toBeGreaterThan(0);
  }
  expect(errors, `console/page errors: ${errors.join('; ')}`).toEqual([]);
});
