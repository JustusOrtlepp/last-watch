import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

const rage = (page: Page): Promise<number> =>
  page
    .locator('#hud-rage')
    .innerText()
    .then((t) => Number(t));

test('title screen shows the game name, begin prompt and idle Tauren canvas', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?debug=1&seed=1&spawn=none');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'title');
  await expect(page.getByRole('heading', { name: 'Tauren Runner' })).toBeVisible();
  await expect(page.getByRole('button', { name: /begin your adventure/ })).toBeVisible();
  await expect(page.locator('#hud-rage')).toHaveText('00000');
  expect(errors).toEqual([]);
});

test('Space starts a run and RAGE increases', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?debug=1&seed=1&spawn=none');
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'running');
  await expect.poll(() => rage(page)).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('forced collision shows game over, saves BEST, and Release Spirit restarts', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?debug=1&seed=1&spawn=immediate');
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'gameover');
  await expect(page.getByRole('heading', { name: 'You have died.' })).toBeVisible();
  await expect(page.locator('#go-record')).toBeVisible();
  const finalRage = await page.locator('#go-rage').innerText();
  expect(Number(finalRage)).toBeGreaterThan(0);
  await expect(page.locator('#go-best')).toHaveText(finalRage);

  // Release Spirit is debounced (0.5 s) and then restarts with a fresh score.
  const release = page.getByRole('button', { name: 'Release Spirit' });
  await expect(release).toBeEnabled();
  await release.click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'running');
  await expect(page.locator('#app')).toHaveAttribute('data-run', '2');
  await expect(page.locator('#hud-best')).toHaveText(finalRage);

  // BEST survives a reload.
  await page.reload();
  await expect(page.locator('#hud-best')).toHaveText(finalRage);
  expect(errors).toEqual([]);
});

test('Space restarts from game over only after the debounce', async ({ page }) => {
  await page.goto('/?debug=1&seed=1&spawn=immediate');
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'gameover');
  await page.keyboard.press('Space'); // inside the debounce window: ignored
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'gameover');
  await expect(page.getByRole('button', { name: 'Release Spirit' })).toBeEnabled();
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'running');
});

test('auto-pauses on visibilitychange and resumes with Escape', async ({ page }) => {
  await page.goto('/?debug=1&seed=1&spawn=none');
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'running');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();

  const frozen = await rage(page);
  await page.waitForTimeout(300);
  expect(await rage(page)).toBe(frozen);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'running');
  await expect.poll(() => rage(page)).toBeGreaterThan(frozen);
});

test('title controls text lists Charge and War Stomp', async ({ page }) => {
  await page.goto('/?debug=1&seed=1&spawn=none');
  await expect(page.locator('#screen-title')).toContainText('Charge: Q or 1');
  await expect(page.locator('#screen-title')).toContainText('War Stomp: E or 2');
});

test('action bar shows three buttons only while running', async ({ page }) => {
  await page.goto('/?debug=1&seed=1&spawn=none');
  await expect(page.locator('#btn-jump')).toBeHidden();
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'running');
  for (const [id, label] of [
    ['#btn-jump', 'Jump (Space)'],
    ['#btn-charge', 'Charge (Q)'],
    ['#btn-stomp', 'War Stomp (E)'],
  ] as const) {
    await expect(page.locator(id)).toBeVisible();
    await expect(page.locator(id)).toHaveAttribute('aria-label', label);
  }
  // No target: Charge is tinted, nothing is cooling.
  await expect(page.locator('#btn-charge')).toHaveAttribute('data-tint', 'true');
  await expect(page.locator('#btn-stomp')).toHaveAttribute('data-cooling', 'false');
});

test('War Stomp starts its cooldown sweep and Charge shows the shared GCD', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?debug=1&seed=1&spawn=none');
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'running');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#btn-stomp')).toHaveAttribute('data-cooling', 'true');
  await expect(page.locator('#btn-stomp .action-time')).toHaveText(/^(10|9)$/);
  expect(errors).toEqual([]);
});

test('Charge without a target shows "Out of range." for about 1.2 s', async ({ page }) => {
  await page.goto('/?debug=1&seed=1&spawn=none');
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'running');
  const error = page.locator('#hud-error');
  await expect(error).toBeHidden();
  await page.keyboard.press('KeyQ');
  await expect(error).toBeVisible();
  await expect(error).toHaveText('Out of range.');
  await expect(error).toBeHidden({ timeout: 3000 });
});

test('Charge on a Quilboar lights up, dashes, and awards RAGE', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?debug=1&seed=1&spawn=enemy');
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'running');
  await expect(page.locator('#btn-charge')).toHaveAttribute('data-lit', 'true', { timeout: 5000 });
  await page.keyboard.press('KeyQ');
  await expect(page.locator('#btn-charge')).toHaveAttribute('data-cooling', 'true');
  await expect(page.locator('#hud-error')).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'running');
  await expect.poll(() => rage(page)).toBeGreaterThanOrEqual(75);
  expect(errors).toEqual([]);
});

test('Charge on a Kodo shows "Immune."', async ({ page }) => {
  await page.goto('/?debug=1&seed=1&spawn=kodo');
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'running');
  await expect(async () => {
    await page.keyboard.press('KeyQ');
    await expect(page.locator('#hud-error')).toHaveText('Immune.', { timeout: 150 });
  }).toPass({ timeout: 8000 });
});

test('a Charge kill pulses the RAGE counter and the toast stays hidden below 1,000 Rage', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?debug=1&seed=1&spawn=enemy');
  await page.keyboard.press('Space');
  await expect(page.locator('#btn-charge')).toHaveAttribute('data-lit', 'true', { timeout: 5000 });
  await page.keyboard.press('KeyQ');
  await expect(page.locator('#hud-rage-counter')).toHaveClass(/pulse/);
  await expect(page.locator('#hud-toast')).toBeHidden();
  expect(errors).toEqual([]);
});

test('reduced motion is read from the media query', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/?debug=1&seed=1&spawn=none');
  await expect(page.locator('#app')).toHaveAttribute('data-reduced-motion', 'true');
  await context.close();
});

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('action buttons are at least 48x48 and tapping War Stomp starts its cooldown', async ({
    page,
  }) => {
    await page.goto('/?debug=1&seed=1&spawn=none');
    await page.getByRole('button', { name: /begin your adventure/ }).tap();
    await expect(page.locator('#app')).toHaveAttribute('data-screen', 'running');
    for (const id of ['#btn-jump', '#btn-charge', '#btn-stomp']) {
      const box = (await page.locator(id).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(48);
      expect(box.height).toBeGreaterThanOrEqual(48);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    await page.locator('#btn-stomp').tap();
    await expect(page.locator('#btn-stomp')).toHaveAttribute('data-cooling', 'true');
  });

  test('settings buttons are tappable and fit inside the frame', async ({ page }) => {
    await page.goto('/?debug=1&seed=1&spawn=none');
    await page.getByRole('button', { name: 'Settings' }).tap();
    await expect(page.locator('#app')).toHaveAttribute('data-screen', 'settings');
    const frame = (await page.locator('#frame').boundingBox())!;
    for (const name of [/^Back/, 'Reset best Rage']) {
      const box = (await page.getByRole('button', { name }).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height);
    }
  });

  test('tap begins, left-side tap jumps, overlays fit on screen', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?debug=1&seed=1&spawn=none');
    const start = page.getByRole('button', { name: /begin your adventure/ });
    await expect(start).toBeVisible();
    const box = (await start.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(48);

    await start.tap();
    await expect(page.locator('#app')).toHaveAttribute('data-screen', 'running');
    const canvasBox = (await page.locator('canvas#game').boundingBox())!;
    await page.touchscreen.tap(
      canvasBox.x + canvasBox.width * 0.2,
      canvasBox.y + canvasBox.height / 2,
    );
    await expect.poll(() => rage(page)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});

test('background music starts on the first gesture and the toggle stops and persists it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?debug=1&seed=1&spawn=none');
  const app = page.locator('#app');
  const toggle = page.locator('#btn-sound');
  await expect(app).toHaveAttribute('data-music', 'idle'); // nothing plays before a gesture
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-screen', 'running');
  await expect(app).toHaveAttribute('data-music', 'playing');

  await toggle.click();
  await expect(app).toHaveAttribute('data-music', 'off');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveText('Sound: Off');
  await expect(app).toHaveAttribute('data-screen', 'running'); // the click did not jump or pause

  await page.reload();
  await expect(app).toHaveAttribute('data-music', 'off');
  await page.keyboard.press('Space'); // muted: no track is loaded
  await expect(app).toHaveAttribute('data-music', 'off');

  await page.keyboard.press('KeyM');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(app).toHaveAttribute('data-music', 'playing');
  expect(errors).toEqual([]);
});
test('settings screen: opens from the title, Esc goes back, and the mute setting persists', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?debug=1&seed=1&spawn=none');
  const app = page.locator('#app');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(app).toHaveAttribute('data-screen', 'settings'); // the click did not begin a run
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  const muted = page.getByLabel(/Mute sound/);
  await expect(muted).not.toBeChecked();
  await muted.check();
  await expect(page.locator('#btn-sound')).toHaveAttribute('aria-pressed', 'false');
  await expect(app).toHaveAttribute('data-music', 'off');

  // With nothing focused, Space is not "begin" inside settings.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-screen', 'settings');
  await page.keyboard.press('Escape');
  await expect(app).toHaveAttribute('data-screen', 'title');

  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel(/Mute sound/)).toBeChecked();
  await page.getByRole('button', { name: /^Back/ }).click();
  await expect(app).toHaveAttribute('data-screen', 'title');
  expect(errors).toEqual([]);
});

test('settings screen: reduced motion applies at once and persists', async ({ page }) => {
  await page.goto('/?debug=1&seed=1&spawn=none');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-reduced-motion', 'false');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel(/Reduced motion/).check();
  await expect(app).toHaveAttribute('data-reduced-motion', 'true');
  await page.reload();
  await expect(app).toHaveAttribute('data-reduced-motion', 'true');
});

test('settings screen: hints can be turned off, and reset best Rage asks first', async ({
  page,
}) => {
  await page.goto('/?debug=1&seed=1&spawn=none');
  await page.evaluate(() => localStorage.setItem('tauren-runner:v1:highscore', '1234'));
  await page.reload();
  await expect(page.locator('#hud-best')).toHaveText('01234');

  await page.getByRole('button', { name: 'Settings' }).click();
  const hints = page.getByLabel(/Show tutorial hints/);
  await expect(hints).toBeChecked();
  await hints.uncheck();
  expect(await page.evaluate(() => localStorage.getItem('tauren-runner:v1:settings'))).toContain(
    '"showHints":false',
  );

  await page.getByRole('button', { name: 'Reset best Rage' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#hud-best')).toHaveText('01234'); // cancel keeps it

  await page.getByRole('button', { name: 'Reset best Rage' }).click();
  await page.getByRole('button', { name: 'Yes, reset' }).click();
  await expect(page.locator('#hud-best')).toHaveText('00000');
  await page.reload();
  await expect(page.locator('#hud-best')).toHaveText('00000');
});
