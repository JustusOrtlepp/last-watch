// Screenshots every sprite sheet in the gallery to .tmp/gallery/ and writes a review index.
// Starts and stops its own Vite dev server (ORCHESTRATION R14).
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const outDir = '.tmp/gallery';
await mkdir(outDir, { recursive: true });

const server = await createServer({ server: { host: '127.0.0.1', port: 5180, strictPort: true } });
await server.listen();
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('http://127.0.0.1:5180/?debug=1&gallery');
  await page.waitForSelector('[data-testid="gallery"]');
  // Let each sheet grow to its widest strip so element screenshots do not clip 3x strips.
  await page.addStyleTag({ content: '[data-sheet] { width: max-content; }' });

  const sheets = page.locator('[data-sheet]');
  const count = await sheets.count();
  const lines = ['# Gallery review index', ''];
  for (let i = 0; i < count; i += 1) {
    const sheet = sheets.nth(i);
    const id = await sheet.getAttribute('data-sheet');
    await sheet.screenshot({ path: `${outDir}/${id}.png` });
    lines.push(`- ${id}.png`);
  }
  await page.locator('[data-testid="palette"]').screenshot({ path: `${outDir}/palette.png` });
  lines.push('- palette.png');
  await writeFile(`${outDir}/README.md`, `${lines.join('\n')}\n`, 'utf8');

  if (errors.length > 0) {
    console.error(`Console errors:\n${errors.slice(0, 10).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`Wrote ${count} sheet screenshots to ${outDir}`);
  }
} finally {
  await browser.close();
  await server.close();
}
