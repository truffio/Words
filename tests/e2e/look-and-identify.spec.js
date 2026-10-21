import { expect, test } from '@playwright/test';

/** Opens the game with a fixed seed and starts a Look and identify round in the kitchen. */
async function startRound(page, seed = 42) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => window.__wordsTest);
  await page.evaluate((s) => window.__wordsTest.setSeed(s), seed);
  await page.getByRole('button', { name: 'Look and identify' }).click();
  await page.waitForFunction(() => window.__wordsTest.state.awaitingAnswer);
}

const state = (page) => page.evaluate(() => window.__wordsTest.state);
const label = (page, id) => page.evaluate((i) => window.__wordsTest.word(i).label, id);

async function waitForChallenge(page, n) {
  await page.waitForFunction(
    (k) =>
      window.__wordsTest.state.challengeNumber === k && window.__wordsTest.state.awaitingAnswer,
    n,
  );
}

/** The word button of an object. */
async function choice(page, objectId) {
  return page
    .getByTestId('choices')
    .getByRole('button', { name: await label(page, objectId), exact: true });
}

/** The word buttons of the current challenge's distractors. */
async function wrongChoices(page) {
  const { challenge, choices } = await state(page);
  return Promise.all(choices.filter((id) => id !== challenge).map((id) => choice(page, id)));
}

test('the target glows and offers word buttons; the right word scores', async ({ page }) => {
  await startRound(page);
  const { challenge, choices, highlighted } = await state(page);

  await expect(page.getByTestId('prompt')).toHaveText('What is this?');
  expect(highlighted).toBe(challenge);
  expect(choices.length).toBeGreaterThanOrEqual(3);
  expect(choices).toContain(challenge);
  await expect(page.getByTestId('choices').getByRole('button')).toHaveCount(choices.length);

  // Tapping objects in the room is not an answer in this activity.
  const tap = (await page.evaluate(() => window.__wordsTest.tapPoints())).find(
    (t) => t.objectId === challenge,
  );
  await page.mouse.click(tap.x, tap.y);
  await expect(page.getByTestId('feedback')).toHaveText('');

  const right = await choice(page, challenge);
  await right.click();
  await expect(page.getByTestId('score')).toHaveText('1 / 1');
  await expect(page.getByTestId('feedback')).toContainText('Great job!');
  await expect(right).toHaveAttribute('data-state', 'correct');
  await expect(right).toBeDisabled();

  await waitForChallenge(page, 2);
  expect((await state(page)).highlighted).toBe((await state(page)).challenge);
});

test('a wrong word asks to try again and is crossed out', async ({ page }) => {
  await startRound(page);
  const [wrong] = await wrongChoices(page);

  await wrong.click();
  await expect(page.getByTestId('feedback')).toHaveText('Not quite. Try again!');
  await expect(page.getByTestId('score')).toHaveText('0 / 0');
  await expect(wrong).toHaveAttribute('data-state', 'wrong');
  await expect(wrong).toBeDisabled();
  expect((await state(page)).awaitingAnswer).toBe(true);

  // The other words can still be chosen.
  await (await choice(page, (await state(page)).challenge)).click();
  await expect(page.getByTestId('score')).toHaveText('1 / 1');
});

test('two wrong words reveal the right one', async ({ page }) => {
  await startRound(page);
  const { challenge } = await state(page);
  const [first, second] = await wrongChoices(page);

  await first.click();
  await second.click();

  const word = await label(page, challenge);
  await expect(page.getByTestId('feedback')).toHaveText(`It's the ${word}.`);
  await expect(page.getByTestId('score')).toHaveText('0 / 1');
  await expect(await choice(page, challenge)).toHaveAttribute('data-state', 'answer');
  await waitForChallenge(page, 2);
});

test('a full round ends with a summary that offers to change activity', async ({ page }) => {
  test.setTimeout(60_000);
  await startRound(page);

  for (let n = 1; n <= 10; n++) {
    await waitForChallenge(page, n);
    await (await choice(page, (await state(page)).challenge)).click();
  }

  await expect(page.getByTestId('summary')).toHaveText('You named 10 out of 10.');
  await page.getByRole('button', { name: 'Change activity' }).click();
  await page.getByRole('button', { name: 'Recall and spell' }).click();
  await waitForChallenge(page, 1);
  expect((await state(page)).activity).toBe('recallAndSpell');
  await expect(page.getByTestId('spelling-input')).toBeVisible();
  await expect(page.getByTestId('choices')).toBeHidden();
});
