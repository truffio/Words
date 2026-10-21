import { expect, test } from '@playwright/test';

/**
 * Opens the game with a fixed seed and starts a Recall and spell round in the kitchen.
 * `nextDelay` keeps feedback on screen longer, for tests that check it after an answer.
 */
async function startRound(page, seed = 42, nextDelay = null) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => window.__wordsTest);
  await page.evaluate((s) => window.__wordsTest.setSeed(s), seed);
  await page.evaluate((ms) => window.__wordsTest.setNextDelay(ms), nextDelay);
  await page.getByRole('button', { name: 'Kitchen' }).click();
  await page.getByRole('button', { name: 'Recall and spell' }).click();
  await page.waitForFunction(() => window.__wordsTest.state.awaitingAnswer);
}

/** Feedback time for tests that check feedback after a challenge ends. */
const FEEDBACK_MS = 5000;

const state = (page) => page.evaluate(() => window.__wordsTest.state);
const word = (page, id) => page.evaluate((i) => window.__wordsTest.word(i), id);

async function waitForChallenge(page, n) {
  await page.waitForFunction(
    (k) =>
      window.__wordsTest.state.challengeNumber === k && window.__wordsTest.state.awaitingAnswer,
    n,
  );
}

/** Starts rounds until the first challenge targets an object with a spelling variant. */
async function startRoundWithVariant(page) {
  for (let seed = 1; seed < 200; seed++) {
    await startRound(page, seed);
    const { label, accepted } = await word(page, (await state(page)).challenge);
    const variant = accepted.find((a) => a !== label);
    if (variant) return variant;
  }
  throw new Error('No seed starts with a word that has a variant.');
}

test('the target glows and a correct spelling scores, submitted with Enter', async ({ page }) => {
  await startRound(page, 42, FEEDBACK_MS);
  const input = page.getByTestId('spelling-input');
  const { challenge, highlighted } = await state(page);

  await expect(page.getByTestId('prompt')).toHaveText('What is this? Type its name.');
  expect(highlighted).toBe(challenge);
  await expect(input).toBeFocused();
  for (const [name, value] of [
    ['autocomplete', 'off'],
    ['autocorrect', 'off'],
    ['autocapitalize', 'off'],
    ['spellcheck', 'false'],
  ]) {
    await expect(input).toHaveAttribute(name, value);
  }

  // Case and extra spaces do not matter.
  const { label } = await word(page, challenge);
  await input.fill(`  ${label.toUpperCase()} `);
  await input.press('Enter');
  await expect(page.getByTestId('score')).toHaveText('1 / 1');
  await expect(page.getByTestId('feedback')).toContainText('Great job!');
  await waitForChallenge(page, 2);
  await expect(input).toHaveValue('');
});

test('an accepted variant is correct', async ({ page }) => {
  const variant = await startRoundWithVariant(page);
  await page.getByTestId('spelling-input').fill(variant);
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByTestId('score')).toHaveText('1 / 1');
});

test('a wrong spelling asks to try again; an empty box is ignored', async ({ page }) => {
  await startRound(page);
  const input = page.getByTestId('spelling-input');

  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByTestId('feedback')).toHaveText('');

  await input.fill('zzz');
  await input.press('Enter');
  await expect(page.getByTestId('feedback')).toHaveText('Not quite. Try again!');
  await expect(page.getByTestId('score')).toHaveText('0 / 0');
  expect((await state(page)).awaitingAnswer).toBe(true);

  // The child can type again straight away.
  const { label } = await word(page, (await state(page)).challenge);
  await page.keyboard.type(label);
  await input.press('Enter');
  await expect(page.getByTestId('score')).toHaveText('1 / 1');
});

test('two wrong spellings reveal the correct spelling', async ({ page }) => {
  await startRound(page, 42, FEEDBACK_MS);
  const input = page.getByTestId('spelling-input');
  const { label } = await word(page, (await state(page)).challenge);

  await input.fill('zzz');
  await input.press('Enter');
  await input.fill('qqq');
  await input.press('Enter');

  await expect(page.getByTestId('feedback')).toHaveText(`It's spelled: ${label}`);
  await expect(input).toHaveValue(label);
  await expect(page.getByTestId('score')).toHaveText('0 / 1');
  await waitForChallenge(page, 2);
});
