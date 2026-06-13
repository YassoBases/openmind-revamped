// Static server for the release web build — any browser tab can open it
// (unlike `flutter run -d chrome`, which only renders in its own tab).
//   node tool/serve.mjs   → http://localhost:5000
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = join(process.cwd(), 'build', 'web');
const PORT = process.env.PORT || 5000;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
  '.bin': 'application/octet-stream', '.symbols': 'application/octet-stream',
};

createServer((req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/') path = '/index.html';
  let file = join(root, path);
  if (!existsSync(file) || !statSync(file).isFile()) file = join(root, 'index.html'); // SPA fallback
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(readFileSync(file));
}).listen(PORT, () => console.log(`[serve] OpenMind app → http://localhost:${PORT}`));
