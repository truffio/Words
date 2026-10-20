import { expect, test } from '@playwright/test';

const ASPECT = 2048 / 1536;

/** Returns the canvas's on-screen width and height. */
async function canvasSize(page) {
  const box = await page.locator('canvas').boundingBox();
  return { width: box.width, height: box.height };
}

test('the game canvas loads and scales to fit the window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  // Wide window: the canvas fills the height and keeps its 4:3 shape.
  await expect.poll(async () => Math.round((await canvasSize(page)).height)).toBe(800);
  const wide = await canvasSize(page);
  expect(wide.width / wide.height).toBeCloseTo(ASPECT, 1);

  // Tall window: the canvas now fills the width.
  await page.setViewportSize({ width: 800, height: 1000 });
  await expect.poll(async () => Math.round((await canvasSize(page)).width)).toBe(800);
  const tall = await canvasSize(page);
  expect(tall.width / tall.height).toBeCloseTo(ASPECT, 1);
});
