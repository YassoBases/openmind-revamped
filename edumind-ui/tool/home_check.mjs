// M3 check: seed profile + token + a couple of saved games (IndexedDB), then
// confirm the home learning path renders real game nodes + the create node,
// and that tapping a node replays it.
//   node tool/home_check.mjs
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 5093;
const server = spawn(process.execPath, [join(here, 'serve.mjs')], {
  env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
});
const shot = (page, name) => page.screenshot({ path: join(here, name) });

try {
  const profile = { name: 'Yasso', grade: 4, language: 'en', color: '#1CB0F6', interest: 'space', dailyGoal: 3 };
  const reg = await fetch('http://127.0.0.1:8080/api/v1/students', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile),
  }).then((r) => r.json());

  // a real sample spec so a tapped node actually replays
  const fs = await import('node:fs');
  const spec = fs.readFileSync(join(here, '..', 'assets', 'samples', 'quest_path_water_cycle.en.json'), 'utf8');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 460, height: 880 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await page.addInitScript(([profile, studentId, token, spec]) => {
    const putStr = (k, v) => localStorage.setItem('flutter.' + k, JSON.stringify(v));
    localStorage.setItem('flutter.profile', JSON.stringify(JSON.stringify(profile)));
    if (studentId) putStr('studentId', studentId);
    if (token) putStr('token', token);
    // seed two saved games into IndexedDB (same db/store the app uses)
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('edumind', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('saved_games')) db.createObjectStore('saved_games', { keyPath: 'id' });
      };
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction('saved_games', 'readwrite');
        const s = tx.objectStore('saved_games');
        const now = Date.now();
        s.put({ id: 'g1', gameType: 'quest_path', theme: 'fantasy', subject: 'Science', topic: 'The Water Cycle', language: 'en', specJson: spec, thumbnailUrl: null, bestScore: 90, playCount: 2, lastPlayedAt: now, savedAt: now, pendingSummaryJson: null });
        s.put({ id: 'g2', gameType: 'goal_shootout', theme: 'football', subject: 'Geography', topic: 'World Capitals', language: 'en', specJson: spec, thumbnailUrl: null, bestScore: 0, playCount: 0, lastPlayedAt: now - 10000, savedAt: now - 10000, pendingSummaryJson: null });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, [profile, reg.studentId, reg.token, spec]);

  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'load' });
  await page.waitForTimeout(13000);
  await shot(page, 'home_1_path.png');

  // tap the top-most game node (newest = "The Water Cycle", top-right in RTL)
  await page.mouse.click(375, 165);
  await page.waitForTimeout(9000);
  await shot(page, 'home_2_replay.png');

  console.log('errors:', errs.length ? errs.slice(0, 6).join('\n') : 'none');
  await browser.close();
} finally {
  server.kill();
}
