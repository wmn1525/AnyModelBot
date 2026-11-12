/** Browser acceptance on static files and in-memory API fixtures; no database or model calls. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright-core';
import manifest from '../../ui/locales/manifest.json';
import { LOCALES } from '../src/i18n/locales';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'test-results/locales');
fs.mkdirSync(out, { recursive: true });
const selected = process.argv.find((a) => a.startsWith('--lang='))?.slice(7);
const locales = manifest.locales.filter((l) => !selected || l.code === selected);
const onlyUI = process.argv.includes('--ui-only');
const onlySite = process.argv.includes('--site-only');
const onlyView = process.argv.find((a) => a.startsWith('--view='))?.slice(7);
const siteMap = fs.readFileSync(path.join(root, 'site/dist/sitemap.xml'), 'utf8');
const nonRootPrefixes = manifest.locales.filter((l) => l.siteCode !== 'zh').map((l) => `/${l.siteCode}`);
const publishedViews = [...siteMap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1].replace(/^https?:\/\/[^/]+/, ''))
  .filter((p) => !nonRootPrefixes.some((prefix) => p === prefix || p.startsWith(prefix + '/')))
  .map((p) => p.replace(/^\/|\/$/g, ''))
  .filter((p) => onlyView === undefined || p === onlyView);
assert(publishedViews.length > 0, 'The built sitemap must contain at least one requested page');
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2' };
const vendors: Record<string, string> = {
  'preact.mjs': 'node_modules/preact/dist/preact.mjs',
  'hooks.mjs': 'node_modules/preact/hooks/dist/hooks.mjs',
  'htm.mjs': 'node_modules/htm/dist/htm.mjs',
};
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url!, 'http://localhost').pathname);
  let base = path.join(root, 'site/dist'), rel = p;
  if (p === '/__app/' || p === '/__app') { base = path.join(root, 'ui'); rel = 'index.html'; }
  else if (p.startsWith('/amb/static/')) { base = path.join(root, 'ui'); rel = p.slice('/amb/static/'.length); }
  else if (p.startsWith('/amb/vendor/')) { base = root; rel = vendors[p.slice('/amb/vendor/'.length)] || '__missing__'; }
  let f = path.resolve(base, `.${path.sep}${rel.replace(/^\//, '')}`);
  if (!f.startsWith(base + path.sep) && f !== base) { res.writeHead(403).end(); return; }
  try {
    if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    res.writeHead(200, { 'content-type': `${mime[path.extname(f)] || 'application/octet-stream'}; charset=utf-8`, 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  } catch { res.writeHead(404).end(); }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}), args: ['--no-sandbox'] });
const errors: string[] = [];
let checked = 0;
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
}
async function noOverflow(page: Page, label: string) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  if (size.content > size.viewport + 1) {
    await page.screenshot({ path: path.join(out, `overflow-${label.replace(/[^a-z0-9]+/gi, '-')}.png`) });
    console.log('isolation', await page.evaluate(() => {
      const chain = []; let parent: Element = document.body;
      for (let depth = 0; depth < 15; depth++) {
        const found = [...parent.children].find((el) => { const e=el as HTMLElement, old=e.style.display; e.style.display='none'; const fixed=document.documentElement.scrollWidth<=innerWidth+1; e.style.display=old; return fixed; });
        if (!found) break;
        chain.push({ tag:found.tagName, id:found.id, cls:found.className, text:found.textContent?.trim().slice(0,70) }); parent=found;
      }
      return chain;
    }));
    console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({e,r}) => e instanceof HTMLElement && r.width > 0 && r.right > innerWidth + 1 && r.left >= 0).sort((a,b) => a.r.right-b.r.right).slice(0, 20).map(({e,r}) => ({tag:e.tagName, cls:e.className, left:r.left,right:r.right,position:getComputedStyle(e).position,parent:e.parentElement?.className,overflow:getComputedStyle(e.parentElement!).overflow,text:e.textContent?.trim().slice(0,40)}))));
  }
  assert(size.content <= size.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(size)}`);
}
try {
  if (!onlyUI) for (const locale of locales) for (const width of (process.argv.some((a) => a.startsWith('--width=')) ? [Number(process.argv.find((a) => a.startsWith('--width='))!.split('=')[1])] : [1440, 390])) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: locale.code, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(20_000);
    page.on('pageerror', (error) => errors.push(`${locale.code} site: ${error.message}`));
    await page.route('**/*', (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const prefix = locale.siteCode === 'zh' ? '' : `/${locale.siteCode}`;
    for (const view of publishedViews) {
      const url = `${origin}${prefix}/${view}`;
      const response = await page.goto(url, { waitUntil: 'networkidle' });
      assert.equal(response?.status(), 200, url);
      await settle(page);
      // The site's HTML tag can be more specific than the app code (pt → pt-BR).
      assert.equal(await page.locator('html').getAttribute('lang'), LOCALES[locale.siteCode as keyof typeof LOCALES].tag);
      assert(await page.locator('h1').innerText(), `${url}: empty heading`);
      assert.equal(await page.locator('link[rel="alternate"][hreflang]').count(), manifest.locales.filter((l) => l.ready).length + 1);
      await noOverflow(page, `${locale.code}/${view} @ ${width}`);
      if (!view || view === 'pricing') await page.screenshot({ path: path.join(out, `site-${locale.code}-${view || 'home'}-${width}.png`) });
      checked++;
    }
    await page.goto(`${origin}${prefix}/pricing?campaign=locale-smoke&d=20&i=1000&o=300#calc`, { waitUntil: 'networkidle' });
    await settle(page);
    const target = manifest.locales.find((l) => l.ready && l.code !== locale.code)!;
    await page.locator(`footer a[data-lang-switch="${target.siteCode}"]`).click();
    await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === `${target.siteCode === 'zh' ? '' : `/${target.siteCode}`}/pricing`);
    const changedURL = new URL(page.url());
    assert.equal(changedURL.searchParams.get('campaign'), 'locale-smoke');
    assert.equal(changedURL.searchParams.get('d'), '20');
    assert.equal(changedURL.hash, '#calc');
    assert.equal(await page.evaluate(() => localStorage.getItem('amb-lang')), target.siteCode);
    await context.close();
    console.log(`site ${locale.code} ${width}: ${publishedViews.length} pages and language-switch state passed`);
  }
  if (!onlySite) for (const locale of locales) {
    let lang = "system", connected = false;
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: locale.code, reducedMotion: 'reduce' });
    await context.addInitScript(() => { localStorage.setItem('amb-prefs', JSON.stringify({ motion: 'off' })); });
    const requests: { path: string; lang?: string }[] = [];
    await context.route('**/amb/api/**', async (route) => {
      const request = route.request();
      const p = new URL(request.url()).pathname.slice('/amb/api'.length);
      requests.push({ path: p, lang: request.headers()['x-amb-lang'] });
      const settings = () => ({ lang, defaultModel: 'demo-model', closeToTray: true, zoom: 1, desktop: false, autostart: { supported: false, on: false }, listen: { host: '127.0.0.1', port: 3600, tokenRequired: true }, dataDir: '/demo/data', webSearch: { provider: 'auto' } });
      let data: unknown = {};
      if (p === '/settings') { if (request.method() === 'PUT') lang = request.postDataJSON().lang; data = settings(); }
      else if (p === '/modelflare') data = { mode: connected ? 'external' : 'managed', connected, line: 'global' };
      else if (p === '/status') data = { version: '0.1.16', username: 'Demo', gateway: { mode: 'external', state: 'running' } };
      else if (p === '/account') data = { state: 'signed_out', loginAvailable: true };
      else if (p === '/bots') data = { bots: [] };
      else if (p === '/groups') data = { groups: [] };
      else if (p === '/models') data = { models: [] };
      else if (p === '/media/models') data = { image: [], video: [], recommended: {} };
      else if (p === '/guide') data = { done: [], seen: [], hidden: true };
      else if (p === '/connections' || p === '/channel-accounts') data = { accounts: [] };
      else if (p === '/conversations') data = { conversations: [] };
      else if (p === '/approvals') data = { approvals: [] };
      else if (p === '/notices') data = { license: 'MIT', notices: 'Localized notice fixture' };
      else if (p === '/update') data = { available: false };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(20_000);
    page.on('pageerror', (e) => { errors.push(`${locale.code} UI: ${e.message}`); console.error(e.message); });
    page.on('console', (message) => { if (message.type() === 'warning' && message.text().includes('[i18n]')) errors.push(message.text()); });
    await page.goto(`${origin}/__app/`, { waitUntil: 'networkidle' });
    await page.locator('[data-screen="onboarding"]').waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), locale.code);
    await page.locator('.onboard-lang button').click();
    assert.equal(await page.locator('[role=menu] [role=menuitemradio]').count() || await page.locator('[role=menu] li').count(), manifest.locales.filter((l) => l.ready).length + 1);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(out, `ui-${locale.code}-onboarding.png`) });
    connected = true;
    await page.goto(`${origin}/__app/#/settings/general`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#set-language').waitFor();
    const languageButton = page.locator('#set-language button');
    await languageButton.click();
    assert.equal(await page.locator('[role=menu] [role=menuitem]').count(), manifest.locales.filter((l) => l.ready).length + 1);
    const other = manifest.locales.find((l) => l.ready && l.code !== locale.code)!.code;
    const name = manifest.locales.find((l) => l.code === other)!.name;
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/amb/api/settings') && r.request().method() === 'PUT'), page.getByRole('menuitem', { name, exact: true }).click()]);
    await page.waitForFunction((l) => document.documentElement.lang === l, other);
    assert.equal(lang, other);
    await languageButton.click();
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/amb/api/settings') && r.request().method() === 'PUT'), page.getByRole('menuitem', { name: locale.name, exact: true }).click()]);
    await page.waitForFunction((l) => document.documentElement.lang === l, locale.code);
    for (const tab of ['general', 'appearance', 'privacy', 'connections', 'about']) {
      await page.goto(`${origin}/__app/#/settings/${tab}`, { waitUntil: 'networkidle' });
      await settle(page);
      await noOverflow(page, `UI ${locale.code} ${tab}`);
      if (tab === 'general' || tab === 'appearance') await page.screenshot({ path: path.join(out, `ui-${locale.code}-${tab}.png`) });
      checked++;
    }
    await page.goto(`${origin}/__app/#/new`, { waitUntil: 'networkidle' });
    await page.keyboard.press('Control+k');
    const input = page.locator('.palette input');
    await input.waitFor();
    await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229, bubbles: true });
    assert(await page.locator('.palette').isVisible(), 'IME Enter must not execute a palette command');
    await input.dispatchEvent('keydown', { key: 'Escape', isComposing: true, keyCode: 229, bubbles: true });
    assert(await page.locator('.palette').isVisible(), 'IME Escape must not close the command palette');
    assert(requests.some((r) => r.path === '/settings' && r.lang === locale.code));
    await context.close();
    console.log(`UI ${locale.code}: onboarding, persistence, settings and IME passed`);
  }
  assert.deepEqual(errors, []);
  console.log(`Locale browser checks passed: ${checked} pages, screenshots in ${out}`);
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
