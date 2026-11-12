// Temporary smoke test: verifies both admin routes load without crashing
// for unauthenticated users (should redirect to /login via ProtectedRoute).
import { chromium } from 'playwright-core';

const BASE = process.env.TEST_URL || 'http://localhost:5175';
const routes = ['/admin/world-cup', '/admin/cup-management', '/world-cup'];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const consoleErrors = [];
page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(`CONSOLE: ${msg.text()}`);
});

let failed = false;
for (const route of routes) {
  consoleErrors.length = 0;
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  const url = page.url();
  const bodyText = (await page.textContent('body'))?.slice(0, 300) || '';
  const blank = bodyText.trim().length === 0;
  const redirectedToLogin = url.includes('/login');
  console.log(`\n=== ${route} ===`);
  console.log(`final URL: ${url}`);
  console.log(`blank page: ${blank}`);
  console.log(`redirected to login: ${redirectedToLogin}`);
  console.log(`body preview: ${bodyText.replace(/\s+/g, ' ').slice(0, 160)}`);
  if (consoleErrors.length) {
    console.log('errors:');
    consoleErrors.slice(0, 5).forEach((e) => console.log('  ' + e));
  } else {
    console.log('no page/console errors');
  }
  if (blank) failed = true;
}

await browser.close();
process.exit(failed ? 1 : 0);
