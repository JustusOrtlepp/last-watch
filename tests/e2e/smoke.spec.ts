import { expect, test } from '@playwright/test';

function collectErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

test('game page renders a canvas at the logical aspect ratio with no console errors', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/');
  const canvas = page.locator('canvas#game');
  await expect(canvas).toBeVisible();
  const size = await canvas.evaluate((c: HTMLCanvasElement) => ({
    w: c.width,
    h: c.height,
    cssW: c.clientWidth,
    cssH: c.clientHeight,
  }));
  expect(size.w / size.h).toBeCloseTo(960 / 270, 1);
  expect(size.cssW / size.cssH).toBeCloseTo(960 / 270, 1);
  expect(errors).toEqual([]);
});

test('canvas rescales with the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 });
  await page.goto('/');
  await expect
    .poll(() => page.locator('canvas#game').evaluate((c: HTMLCanvasElement) => c.width))
    .toBe(480);
});

test('gallery loads in debug mode and renders the tauren sheet', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?debug=1&gallery');
  await expect(page.getByTestId('gallery')).toBeVisible();
  await expect(page.getByTestId('palette')).toBeVisible();
  await expect(page.locator('[data-sheet="tauren"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('gallery shows seamless background tiles and scroll views at start and max speed', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?debug=1&gallery');
  await expect(page.locator('[data-sheet="background-layers"]')).toBeVisible();
  await expect(page.locator('[data-seam="pass"]')).toHaveCount(4);
  await expect(page.locator('[data-seam="fail"]')).toHaveCount(0);
  const views = page.locator('[data-sheet="scroll-views"] canvas');
  await expect(views).toHaveCount(2);
  expect(await views.evaluateAll((c) => c.map((v) => v.getAttribute('data-speed')))).toEqual([
    '360',
    '900',
  ]);
  expect(errors).toEqual([]);
});
