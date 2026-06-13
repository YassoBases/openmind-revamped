// M5 verification: seed an English profile + a couple of saved games, then
// capture the home path, profile, about, and settings — all should render in
// English (LTR). Pass language 'ar' to capture the Arabic variant.
//   node tool/bilingual_check.mjs en   |   node tool/bilingual_check.mjs ar
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const lang = process.argv[2] === 'ar' ? 'ar' : 'en';
const PORT = 5096;
const server = spawn(process.execPath, [join(here, 'serve.mjs')], {
  env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
});
const shot = (page, name) => page.screenshot({ path: join(here, `${lang}_${name}.png`) });

try {
  const profile = { name: 'Yasso', grade: 6, language: lang, color: '#8E24AA', interest: 'space', dailyGoal: 3 };
  const reg = await fetch('http://127.0.0.1:8080/api/v1/students', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile),
  }).then((r) => r.json());
  const spec = readFileSync(join(here, '..', 'assets', 'samples', 'quest_path_water_cycle.en.json'), 'utf8');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 460, height: 880 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));

  await page.addInitScript(([profile, studentId, token, spec]) => {
    const putStr = (k, v) => localStorage.setItem('flutter.' + k, JSON.stringify(v));
    localStorage.setItem('flutter.profile', JSON.stringify(JSON.stringify(profile)));
    if (studentId) putStr('studentId', studentId);
    if (token) putStr('token', token);
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
  await shot(page, '1_home');
  // bottom nav: Home(0) Profile(1) Settings(2) About(3); LTR for en, RTL for ar
  const tabX = lang === 'en' ? [60, 170, 285, 400] : [400, 285, 170, 60];
  await page.mouse.click(tabX[1], 822); await page.waitForTimeout(1500); await shot(page, '2_profile');
  await page.mouse.click(tabX[3], 822); await page.waitForTimeout(1500); await shot(page, '3_about');
  await page.mouse.click(tabX[2], 822); await page.waitForTimeout(1200); await shot(page, '4_settings');

  console.log(`[${lang}] errors:`, errs.length ? errs.slice(0, 5).join('\n') : 'none');
  await browser.close();
} finally {
  server.kill();
}
