// M2 vertical-slice check: seed a profile (so we skip onboarding), open the
// AI composer, generate a game, and confirm the Phaser player renders it.
//   node tool/slice_check.mjs
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 5090;
const server = spawn(process.execPath, [join(here, 'serve.mjs')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});
const shot = (page, name) => page.screenshot({ path: join(here, name) });

try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 460, height: 880 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  // Register a student first (what onboarding will do in M4) so createGame is
  // authorized, then seed profile + auth into shared_preferences.
  const profile = {
    name: 'Yasso', grade: 4, language: 'en', color: '#1CB0F6', interest: 'space', dailyGoal: 3,
  };
  const reg = await fetch('http://127.0.0.1:8080/api/v1/students', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(profile),
  }).then((r) => r.json());
  console.log('registered:', reg.studentId ? 'ok' : JSON.stringify(reg));

  // shared_preferences (web) is localStorage with a `flutter.` prefix, and it
  // JSON-encodes string values (and jsonDecodes on read). So a String pref must
  // be stored *double-encoded*: the outer value decodes to the inner JSON string.
  await page.addInitScript(([profile, studentId, token]) => {
    // plain-string prefs: single JSON layer (getString jsonDecodes once)
    const putStr = (k, v) => localStorage.setItem('flutter.' + k, JSON.stringify(v));
    // profile pref holds a JSON *string* that Session.profile then jsonDecodes → two layers
    localStorage.setItem('flutter.profile', JSON.stringify(JSON.stringify(profile)));
    if (studentId) putStr('studentId', studentId);
    if (token) putStr('token', token);
  }, [profile, reg.studentId, reg.token]);

  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  await shot(page, 'slice_1_home.png');

  // Tap the temporary "Create (AI)" FAB. RTL puts the extended FAB bottom-LEFT.
  await page.mouse.click(80, 740);
  await page.waitForTimeout(2500);
  await shot(page, 'slice_2_composer.png');

  // Composer: the topic TextField (placeholder "مثال: ...") is just under the
  // "ماذا تريد أن تتعلم؟" label, ~y=215. The whole form fits the viewport.
  await page.mouse.click(230, 215);
  await page.waitForTimeout(500);
  await page.keyboard.type('the water cycle');
  await page.waitForTimeout(500);
  await shot(page, 'slice_3_filled.png');
  // Generate button ("أنشئ لعبتي") near the bottom, ~y=705.
  await page.mouse.click(230, 705);
  // generation + progressive start → Phaser player
  await page.waitForTimeout(15000);
  await shot(page, 'slice_4_player.png');

  console.log('errors:', errs.length ? errs.slice(0, 8).join('\n') : 'none');
  await browser.close();
} finally {
  server.kill();
}
