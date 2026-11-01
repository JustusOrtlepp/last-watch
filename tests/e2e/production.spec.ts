import { existsSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * SPEC 13 / 14.2: the production build, served with the exact `vercel.json` headers, loads and
 * plays with no console errors and no CSP violations. Needs `npm run build` first.
 */
const DIST = join(process.cwd(), 'dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};

interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

let server: Server;
let origin = '';

test.beforeAll(async () => {
  if (!existsSync(join(DIST, 'index.html'))) {
    throw new Error('dist/ is missing: run `npm run build` before the production e2e test.');
  }
  const rules = (JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: HeaderRule[] })
    .headers;
  server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    const file = normalize(join(DIST, path === '/' ? 'index.html' : path));
    if (!file.startsWith(DIST) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const headers: Record<string, string> = {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    };
    for (const rule of rules) {
      const matches =
        rule.source === '/(.*)' || (rule.source === '/assets/(.*)' && path.startsWith('/assets/'));
      if (matches) for (const h of rule.headers) headers[h.key] = h.value;
    }
    res.writeHead(200, headers).end(readFileSync(file));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

test('production build runs under the Vercel headers with no errors or CSP violations', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(msg.text());
  });
  page.on('pageerror', (err) => problems.push(String(err)));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });

  const response = await page.goto(`${origin}/`);
  const headers = response!.headers();
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['x-robots-tag']).toBe('noindex, nofollow');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');

  await expect(page.locator('canvas#game')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');

  // Play: starts the run, the music fetch/decode (connect-src, media-src), sfx and every screen.
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'running');
  await page.keyboard.press('KeyQ');
  await page.keyboard.press('KeyE');
  await page.keyboard.press('Space');
  await expect
    .poll(async () => Number(await page.locator('#hud-rage').innerText()))
    .toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);

  expect(problems).toEqual([]);

  const robots = await page.request.get(`${origin}/robots.txt`);
  expect(await robots.text()).toContain('Disallow: /');
});

test('debug hooks are absent in the production build', async ({ page }) => {
  await page.goto(`${origin}/?debug=1&seed=1&spawn=none&gallery`);
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'title');
  await expect(page.getByRole('heading', { name: 'Tauren Runner' })).toBeVisible();
});
