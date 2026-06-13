import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 460, height: 880 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.addInitScript(() => {
  localStorage.setItem('flutter.profile', JSON.stringify({
    name: 'Yasso', grade: 4, language: 'en', color: '#1CB0F6', interest: 'space', dailyGoal: 3,
  }));
});
await page.goto('http://127.0.0.1:5092', { waitUntil: 'load' });
await page.waitForTimeout(15000);
console.log('ERRORS:\n' + (errs.length ? errs.slice(0,3).join('\n---\n') : 'none'));
await browser.close();
