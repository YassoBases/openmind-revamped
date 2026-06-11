import { chromium, devices } from '@playwright/test';
import { buildHtml, loadSpec, debugState, stepOnce, tap } from '../test/driver.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 5'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));

const spec = loadSpec('draw_connect_plant_cell.en.json');
await page.setContent(buildHtml('draw_connect', spec), { waitUntil: 'load' });
await page.waitForTimeout(1800);

// menu → tutorial
for (let i = 0; i < 30; i++) {
  const dbg = await debugState(page);
  if (dbg.connect && dbg.connect.length) break;
  await stepOnce(page);
  await page.waitForTimeout(300);
}

const dbg = await debugState(page);
console.log('state:', dbg.state, 'connect:', JSON.stringify(dbg.connect));

if (dbg.connect && dbg.connect.length) {
  const c = dbg.connect[0];
  const a = await page.evaluate(([x, y]) => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { x: r.x + (x / 720) * r.width, y: r.y + (y / 1280) * r.height };
  }, [c.ax, c.ay]);
  console.log('drag start game', c.ax, c.ay, '→ client', a.x.toFixed(1), a.y.toFixed(1));

  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  const ds = await page.evaluate(() => {
    const s = EduCore.game.scene.getScene('GameScene');
    return {
      drawState: !!s.drawState,
      drawingEnabled: s.drawingEnabled,
      pointer: [Math.round(s.input.activePointer.x), Math.round(s.input.activePointer.y)],
      nearest: (() => {
        const p = s.input.activePointer;
        let best = null, bd = 1e9;
        for (const [id, n] of s.nodes) {
          const d = Math.hypot(n.pos.x - p.x, n.pos.y - p.y);
          if (d < bd) { bd = d; best = id; }
        }
        return { best, dist: Math.round(bd) };
      })(),
    };
  });
  console.log('after down:', JSON.stringify(ds));

  // complete the drag to the end node
  const b = await page.evaluate(([x, y]) => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { x: r.x + (x / 720) * r.width, y: r.y + (y / 1280) * r.height };
  }, [c.bx, c.by]);
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / 10, a.y + ((b.y - a.y) * i) / 10);
    await page.waitForTimeout(14);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const s = EduCore.game.scene.getScene('GameScene');
    return {
      completed: [...s.completedPairs],
      drawState: !!s.drawState,
      pointer: [Math.round(s.input.activePointer.x), Math.round(s.input.activePointer.y)],
      remaining: window.EduMindDebug.getConnect().length,
    };
  });
  console.log('after drag:', JSON.stringify(after));
}
await browser.close();
