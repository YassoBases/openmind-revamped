// M4 check: Settings tab renders with the language selector, and toggling to
// English flips the whole app to LTR English.
//   node tool/settings_check.mjs
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 5095;
const server = spawn(process.execPath, [join(here, 'serve.mjs')], {
  env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
});
const shot = (page, name) => page.screenshot({ path: join(here, name) });

try {
  const profile = { name: 'Yasso', grade: 4, language: 'ar', color: '#8E24AA', interest: 'space', dailyGoal: 3 };
  const reg = await fetch('http://127.0.0.1:8080/api/v1/students', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile),
  }).then((r) => r.json());

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 460, height: 880 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript(([profile, studentId, token]) => {
    const putStr = (k, v) => localStorage.setItem('flutter.' + k, JSON.stringify(v));
    localStorage.setItem('flutter.profile', JSON.stringify(JSON.stringify(profile)));
    if (studentId) putStr('studentId', studentId);
    if (token) putStr('token', token);
  }, [profile, reg.studentId, reg.token]);

  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'load' });
  await page.waitForTimeout(12000);

  // Bottom nav (RTL order right→left: Home, Profile, Settings, About).
  // Settings is the 3rd slot from the right.
  await page.mouse.click(170, 822);
  await page.waitForTimeout(1500);
  await shot(page, 'set_1_settings_ar.png');

  // Toggle to English (the "En" button inside the language tile, top-left).
  await page.mouse.click(75, 108);
  await page.waitForTimeout(1500);
  await shot(page, 'set_2_settings_en.png');

  console.log('errors:', errs.length ? errs.slice(0, 5).join('\n') : 'none');
  await browser.close();
} finally {
  server.kill();
}
