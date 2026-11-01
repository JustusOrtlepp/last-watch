// Release check (SPEC 12, 13; ORCHESTRATION P6): bundle size report plus static checks of the
// built `dist/` and `vercel.json`. Run after `npm run build`. Prints a short report; exit 1 on failure.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const JS_BUDGET_GZ = 150 * 1024; // SPEC 12: JS < 150 KB gzipped, including all art data
const FIRST_LOAD_BUDGET_GZ = 250 * 1024; // html + js + css, music excluded (lazy, after first gesture)

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

if (!existsSync('dist/index.html')) {
  console.error('dist/ is missing: run `npm run build` first.');
  process.exit(1);
}

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
};
walk('dist');

const rows = files.map((path) => {
  const data = readFileSync(path);
  return { path: path.replaceAll('\\', '/'), raw: data.length, gz: gzipSync(data).length, data };
});

console.log('Bundle report (dist/):');
for (const r of rows)
  console.log(`  ${r.path.padEnd(52)} ${kb(r.raw).padStart(10)}  gzip ${kb(r.gz).padStart(9)}`);

const sum = (list, key) => list.reduce((n, r) => n + r[key], 0);
const js = rows.filter((r) => extname(r.path) === '.js');
const firstLoad = rows.filter((r) => ['.html', '.js', '.css'].includes(extname(r.path)));
const audio = rows.filter((r) => extname(r.path) === '.mp3');
console.log(`JS gzip total      ${kb(sum(js, 'gz'))} (budget ${kb(JS_BUDGET_GZ)})`);
console.log(
  `First load gzip    ${kb(sum(firstLoad, 'gz'))} (html + js + css; budget ${kb(FIRST_LOAD_BUDGET_GZ)})`,
);
console.log(`Music (lazy)       ${kb(sum(audio, 'raw'))}`);
check(sum(js, 'gz') < JS_BUDGET_GZ, `JS gzip ${kb(sum(js, 'gz'))} exceeds ${kb(JS_BUDGET_GZ)}`);
check(sum(firstLoad, 'gz') < FIRST_LOAD_BUDGET_GZ, 'first-load payload exceeds its budget');

// Built HTML: no inline script/style, no inline handlers (CSP compliance, SPEC 13).
const html = readFileSync('dist/index.html', 'utf8');
check(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(html), 'index.html has an inline <script>');
check(!/<style[\s>]/i.test(html), 'index.html has an inline <style>');
check(!/\sstyle\s*=/i.test(html), 'index.html has an inline style attribute');
check(!/\son[a-z]+\s*=/i.test(html), 'index.html has an inline event handler');
check(
  /<meta name="robots" content="noindex, nofollow"\s*\/?>/i.test(html),
  'index.html lacks the noindex meta tag',
);

// Security (SPEC 12): no eval / new Function, no external origins in the shipped code.
for (const r of rows.filter((r) => ['.js', '.css', '.html'].includes(extname(r.path)))) {
  const text = r.data.toString('utf8');
  check(!/\beval\s*\(/.test(text), `${r.path} uses eval()`);
  check(!/new Function\s*\(/.test(text), `${r.path} uses new Function()`);
  const external = (text.match(/https?:\/\/[^\s"'`)]+/g) ?? []).filter(
    (u) => !/^https?:\/\/(www\.w3\.org|127\.0\.0\.1|localhost)/.test(u),
  );
  check(
    external.length === 0,
    `${r.path} references external origins: ${external.slice(0, 3).join(' ')}`,
  );
}

// robots.txt and vercel.json headers (SPEC 13).
const robots = existsSync('dist/robots.txt') ? readFileSync('dist/robots.txt', 'utf8') : '';
check(
  /^User-agent:\s*\*/im.test(robots) && /^Disallow:\s*\/\s*$/im.test(robots),
  'robots.txt does not disallow all',
);

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const headersFor = (source) =>
  Object.fromEntries(
    vercel.headers
      .filter((h) => h.source === source)
      .flatMap((h) => h.headers.map((x) => [x.key, x.value])),
  );
const all = headersFor('/(.*)');
check(
  all['Content-Security-Policy'] === CSP,
  'vercel.json Content-Security-Policy differs from SPEC 13',
);
check(all['X-Content-Type-Options'] === 'nosniff', 'vercel.json X-Content-Type-Options missing');
check(all['Referrer-Policy'] === 'no-referrer', 'vercel.json Referrer-Policy missing');
check(
  all['Permissions-Policy'] === 'camera=(), microphone=(), geolocation=()',
  'vercel.json Permissions-Policy missing',
);
check(all['X-Robots-Tag'] === 'noindex, nofollow', 'vercel.json X-Robots-Tag missing');
check(
  headersFor('/assets/(.*)')['Cache-Control'] === 'public, max-age=31536000, immutable',
  'vercel.json /assets Cache-Control missing',
);
check(
  vercel.framework === 'vite' && vercel.outputDirectory === 'dist',
  'vercel.json framework/output differ from SPEC 13',
);
check(
  !('passwordProtection' in vercel) && !('ssoProtection' in vercel),
  'vercel.json enables deployment protection (must be link-only, SPEC 13)',
);

if (failures.length > 0) {
  console.log(`\nFAILED (${failures.length}):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll release checks passed.');
