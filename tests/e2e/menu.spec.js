import { expect, test } from '@playwright/test';

const state = (page) => page.evaluate(() => window.__wordsTest.state);
const menuButton = (page) => page.getByRole('button', { name: 'Menu' });
const menu = (page) => page.getByRole('dialog', { name: 'Menu' });

/** Opens the game with a fixed seed and chooses the kitchen. */
async function openKitchen(page, nextDelay = null) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => window.__wordsTest);
  await page.evaluate(
    ([ms]) => {
      window.__wordsTest.setSeed(42);
      window.__wordsTest.setNextDelay(ms);
    },
    [nextDelay],
  );
  await page.getByRole('button', { name: 'Kitchen' }).click();
  await expect(page.getByTestId('room-title')).toHaveText('Kitchen');
}

async function startActivity(page, name) {
  await page.getByRole('button', { name }).click();
  await waitForChallenge(page, 1);
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

test('the menu icon shows once a room is open', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Words' })).toBeVisible();
  await expect(menuButton(page)).toBeHidden();

  await page.getByRole('button', { name: 'Kitchen' }).click();
  await expect(menuButton(page)).toBeVisible();

  // Before any activity, there is nothing to restart.
  await menuButton(page).click();
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('button', { name: 'Restart activity' })).toBeHidden();
  await expect(menu(page).getByRole('button', { name: 'Change activity' })).toBeVisible();
  await expect(menu(page).getByRole('button', { name: 'Change room' })).toBeVisible();
});

test('opening the menu pauses the round; closing it returns to the same challenge', async ({
  page,
}) => {
  await openKitchen(page);
  await startActivity(page, 'Listen and find');

  await menuButton(page).click();
  await expect(menu(page)).toBeVisible();
  const paused = await state(page);
  expect(paused).toMatchObject({ menuOpen: true, paused: true });

  // The room behind cannot be used, and the clock stands still.
  await clickTarget(page);
  await page.waitForTimeout(1500);
  const stillPaused = await state(page);
  expect(stillPaused.score).toEqual(paused.score);
  await expect(page.getByTestId('feedback')).toHaveText('');

  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  expect(await state(page)).toMatchObject({
    menuOpen: false,
    paused: false,
    challengeNumber: 1,
    awaitingAnswer: true,
  });

  // The round goes on as before.
  await clickTarget(page);
  await expect(page.getByTestId('score')).toHaveText('1 / 1');
});

test('the next challenge waits while the menu is open', async ({ page }) => {
  // Long enough for the menu to open before the next challenge is due, even on CI.
  await openKitchen(page, 3000);
  await startActivity(page, 'Listen and find');

  await clickTarget(page);
  await expect(page.getByTestId('score')).toHaveText('1 / 1');
  await menuButton(page).click();
  expect(await state(page)).toMatchObject({ challengeNumber: 1, menuOpen: true });

  // Well past the feedback time, the round is still on the ended challenge.
  await page.waitForTimeout(4000);
  expect(await state(page)).toMatchObject({ challengeNumber: 1, awaitingAnswer: false });

  await menu(page).getByRole('button', { name: 'Back to the game' }).click();
  await waitForChallenge(page, 2);
});

test('Restart activity starts a new round of the same activity', async ({ page }) => {
  await openKitchen(page);
  await startActivity(page, 'Look and identify');
  const { challenge } = await state(page);
  await page.locator(`[data-object-id="${challenge}"]`).click();
  await expect(page.getByTestId('score')).toHaveText('1 / 1');

  await menuButton(page).click();
  await menu(page).getByRole('button', { name: 'Restart activity' }).click();
  await waitForChallenge(page, 1);
  expect(await state(page)).toMatchObject({ activity: 'lookAndIdentify', room: 'kitchen' });
  await expect(page.getByTestId('score')).toHaveText('0 / 0');
});

test('Change activity leads to the activities of the same room', async ({ page }) => {
  await openKitchen(page);
  await startActivity(page, 'Listen and find');

  await menuButton(page).click();
  await menu(page).getByRole('button', { name: 'Change activity' }).click();
  await expect(page.getByTestId('room-title')).toHaveText('Kitchen');
  expect((await state(page)).screen).toBe('start');

  await startActivity(page, 'Recall and spell');
  expect(await state(page)).toMatchObject({ activity: 'recallAndSpell', room: 'kitchen' });
});

test('Change room leads to the room selection', async ({ page }) => {
  await openKitchen(page);
  await startActivity(page, 'Listen and find');

  await menuButton(page).click();
  await menu(page).getByRole('button', { name: 'Change room' }).click();
  await expect(page.getByRole('heading', { name: 'Words' })).toBeVisible();
  await expect(menuButton(page)).toBeHidden();

  await page.getByRole('button', { name: 'Bedroom' }).click();
  await expect(page.getByTestId('room-title')).toHaveText('Bedroom');
  await startActivity(page, 'Listen and find');
  expect((await state(page)).room).toBe('bedroom');
});

test('closing the menu while spelling puts the cursor back in the box', async ({ page }) => {
  await openKitchen(page);
  await startActivity(page, 'Recall and spell');
  const input = page.getByTestId('spelling-input');
  await input.fill('fri');

  await menuButton(page).click();
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('fri');
});
