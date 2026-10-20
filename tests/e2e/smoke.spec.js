import { expect, test } from '@playwright/test';

const ASPECT = 2048 / 1536;

/** Returns the canvas's on-screen rectangle. */
async function canvasBox(page) {
  return page.locator('canvas').boundingBox();
}

test('the start screen shows over the game canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Words' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
});

test('the game canvas keeps its 4:3 shape and rescales with the window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();

  await expect.poll(async () => (await canvasBox(page)).height).toBeGreaterThan(600);
  const wide = await canvasBox(page);
  expect(wide.width / wide.height).toBeCloseTo(ASPECT, 1);
  expect(wide.x + wide.width).toBeLessThanOrEqual(1281);
  expect(wide.y + wide.height).toBeLessThanOrEqual(801);

  await page.setViewportSize({ width: 800, height: 1000 });
  await expect.poll(async () => Math.round((await canvasBox(page)).width)).toBe(800);
  const tall = await canvasBox(page);
  expect(tall.width / tall.height).toBeCloseTo(ASPECT, 1);
});
