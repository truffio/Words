import { expect, test } from '@playwright/test';

/**
 * Opens the game with a fixed seed and starts a round in the kitchen.
 * `nextDelay` keeps feedback on screen longer, for tests that check it after an answer.
 */
async function startRound(page, seed = 42, nextDelay = null) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => window.__wordsTest);
  await page.evaluate((s) => window.__wordsTest.setSeed(s), seed);
  await page.evaluate((ms) => window.__wordsTest.setNextDelay(ms), nextDelay);
  await page.getByRole('button', { name: 'Listen and find' }).click();
  await page.waitForFunction(() => window.__wordsTest.state.awaitingAnswer);
}

/** Feedback time for tests that check feedback after a challenge ends. */
const FEEDBACK_MS = 5000;

const state = (page) => page.evaluate(() => window.__wordsTest.state);
const tapPoints = (page) => page.evaluate(() => window.__wordsTest.tapPoints());

/** Waits for challenge `n` to be open. */
async function waitForChallenge(page, n) {
  await page.waitForFunction(
    (k) =>
      window.__wordsTest.state.challengeNumber === k && window.__wordsTest.state.awaitingAnswer,
    n,
  );
}

async function clickObject(page, objectId) {
  const point = (await tapPoints(page)).find((t) => t.objectId === objectId);
  await page.mouse.click(point.x, point.y);
}

async function clickWrongObject(page, objectId) {
  const point = (await tapPoints(page)).find((t) => t.objectId !== objectId);
  await page.mouse.click(point.x, point.y);
}

test('a correct answer scores, a wrong answer asks to try again', async ({ page }) => {
  await startRound(page, 42, FEEDBACK_MS);
  const score = page.getByTestId('score');
  const feedback = page.getByTestId('feedback');
  const prompt = page.getByTestId('prompt');

  const first = (await state(page)).challenge;
  await expect(prompt).toHaveText(/^Find (the|a) /);
  await expect(score).toHaveText('0 / 0');

  // Clicking an empty wall is ignored.
  const wall = await page.evaluate(() => window.__wordsTest.toScreen(60, 60));
  await page.mouse.click(wall.x, wall.y);
  await expect(feedback).toHaveText('');
  expect((await state(page)).awaitingAnswer).toBe(true);

  await clickObject(page, first);
  await expect(score).toHaveText('1 / 1');
  await expect(feedback).toContainText('Great job!');

  await waitForChallenge(page, 2);
  const second = (await state(page)).challenge;
  await clickWrongObject(page, second);
  await expect(feedback).toHaveText('Not quite. Try again!');
  await expect(score).toHaveText('1 / 1');
  expect((await state(page)).awaitingAnswer).toBe(true);
});

test('two wrong answers reveal the object', async ({ page }) => {
  await startRound(page, 42, FEEDBACK_MS);
  const target = (await state(page)).challenge;

  await clickWrongObject(page, target);
  await clickWrongObject(page, target);

  await expect(page.getByTestId('feedback')).toContainText('Here it is:');
  await expect(page.getByTestId('score')).toHaveText('0 / 1');
  await waitForChallenge(page, 2);
});

test('a full round ends with a summary and can be replayed', async ({ page }) => {
  test.setTimeout(60_000);
  await startRound(page);

  for (let n = 1; n <= 10; n++) {
    await waitForChallenge(page, n);
    await clickObject(page, (await state(page)).challenge);
  }

  await expect(page.getByRole('heading', { name: 'Well done!' })).toBeVisible();
  await expect(page.getByTestId('summary')).toHaveText('You found 10 out of 10.');

  await page.getByRole('button', { name: 'Play again' }).click();
  await waitForChallenge(page, 1);
  await expect(page.getByTestId('score')).toHaveText('0 / 0');
});
