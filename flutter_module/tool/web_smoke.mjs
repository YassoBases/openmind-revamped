// Boots the built Flutter web app in headless Chromium and verifies it
// renders the onboarding without console errors. Run from flutter_module:
//   node tool/web_smoke.mjs
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from '../../node_modules/@playwright/test/index.mjs';

const root = join(process.cwd(), 'build', 'web');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.otf': 'font/otf', '.ttf': 'font/ttf', '.frag': 'application/octet-stream',
};

const server = createServer((req, res) => {
  let path = req.url.split('?')[0];
  if (path === '/') path = '/index.html';
  const file = join(root, path);
  if (!existsSync(file)) {
    res.writeHead(404); res.end('nope'); return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(8123, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/google.*fonts|net::ERR|Failed to load resource/i.test(m.text())) {
    errors.push(m.text());
  }
});
await page.goto('http://localhost:8123/');
await page.waitForTimeout(15000); // CanvasKit boot
await page.screenshot({ path: 'tool/web_smoke.png' });

const hasCanvas = await page.evaluate(() =>
  !!document.querySelector('flutter-view, flt-glass-pane, canvas'));
console.log('flutter rendered:', hasCanvas);
console.log('errors:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
await browser.close();
server.close();
process.exit(hasCanvas && errors.length === 0 ? 0 : 1);
