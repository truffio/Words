import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/** The object IDs of a room, read from its manifest (independently of the game). */
const objectsOf = (roomId) =>
  JSON.parse(readFileSync(`content/rooms/${roomId}/manifest.json`, 'utf8')).objects.map(
    (o) => o.id,
  );

const state = (page) => page.evaluate(() => window.__wordsTest.state);

async function open(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => window.__wordsTest);
  await page.evaluate(() => window.__wordsTest.setSeed(42));
}

/** Chooses a room on the room screen and waits for its activities. */
async function chooseRoom(page, title) {
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByTestId('room-title')).toHaveText(title);
  await expect(page.getByRole('button', { name: 'Listen and find' })).toBeVisible();
}

async function waitForChallenge(page, n) {
  await page.waitForFunction(
    (k) =>
      window.__wordsTest.state.challengeNumber === k && window.__wordsTest.state.awaitingAnswer,
    n,
  );
}

async function clickTarget(page) {
  const { challenge } = await state(page);
  const points = await page.evaluate(() => window.__wordsTest.tapPoints());
  const point = points.find((t) => t.objectId === challenge);
  await page.mouse.click(point.x, point.y);
}

test('choose a room, play, change room, and play in the new room', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);

  await chooseRoom(page, 'Bedroom');
  await page.getByRole('button', { name: 'Listen and find' }).click();
  const bedroom = objectsOf('bedroom');
  for (let n = 1; n <= 10; n++) {
    await waitForChallenge(page, n);
    const { room, challenge } = await state(page);
    expect(room).toBe('bedroom');
    expect(bedroom).toContain(challenge);
    await clickTarget(page);
  }
  await expect(page.getByTestId('summary')).toHaveText('You found 10 out of 10.');

  await page.getByRole('button', { name: 'Change room' }).click();
  await chooseRoom(page, 'Bathroom');
  await page.getByRole('button', { name: 'Look and identify' }).click();
  await waitForChallenge(page, 1);
  const { room, challenge, choices } = await state(page);
  expect(room).toBe('bathroom');
  const bathroom = objectsOf('bathroom');
  expect(bathroom).toContain(challenge);
  for (const id of choices) expect(bathroom).toContain(id);

  // The room's own objects are on screen: every tap point belongs to the bathroom.
  const points = await page.evaluate(() => window.__wordsTest.tapPoints());
  expect(new Set(points.map((p) => p.objectId))).toEqual(new Set(bathroom));
});

test('the activity screen leads back to the rooms', async ({ page }) => {
  await open(page);
  await chooseRoom(page, 'Kitchen');
  await page.getByRole('button', { name: 'Change room' }).click();
  await expect(page.getByRole('heading', { name: 'Words' })).toBeVisible();

  // Choosing the open room again shows its activities straight away.
  await chooseRoom(page, 'Kitchen');
  expect((await state(page)).room).toBe('kitchen');
});

test('switching rooms keeps only the open room in memory', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);

  const roomKeys = (keys) => keys.filter((k) => /^[a-z-]+:/.test(k));
  const counts = [];
  for (const [title, id] of [
    ['Kitchen', 'kitchen'],
    ['Bedroom', 'bedroom'],
    ['Bathroom', 'bathroom'],
    ['Kitchen', 'kitchen'],
    ['Bedroom', 'bedroom'],
    ['Bathroom', 'bathroom'],
  ]) {
    await chooseRoom(page, title);
    const keys = roomKeys(await page.evaluate(() => window.__wordsTest.textureKeys()));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(key.startsWith(`${id}:`)).toBe(true);
    counts.push(keys.length);
    await page.getByRole('button', { name: 'Change room' }).click();
  }

  // The second visit to each room holds no more textures than the first.
  expect(counts.slice(3)).toEqual(counts.slice(0, 3));
  expect(errors).toEqual([]);
});
