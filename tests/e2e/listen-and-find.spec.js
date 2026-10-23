import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/** The number of objects in a room, read from its manifest (independently of the game). */
const objectCount = (roomId) =>
  JSON.parse(readFileSync(`content/rooms/${roomId}/manifest.json`, 'utf8')).objects.length;

/**
 * Opens the game with a fixed seed and starts a round in a room (the kitchen by default).
 * `nextDelay` keeps feedback on screen longer, for tests that check it after an answer.
 */
async function startRound(page, seed = 42, nextDelay = null, room = 'Kitchen') {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => window.__wordsTest);
  await page.evaluate((s) => window.__wordsTest.setSeed(s), seed);
  await page.evaluate((ms) => window.__wordsTest.setNextDelay(ms), nextDelay);
  await page.getByRole('button', { name: room }).click();
  await page.getByRole('button', { name: 'Listen and find' }).click();
  await page.waitForFunction(() => window.__wordsTest.state.awaitingAnswer);
}

/** Feedback time for tests that check feedback after a challenge ends. */
const FEEDBACK_MS = 5000;
/** Feedback time for tests that play many challenges and do not check feedback. */
const FAST_MS = 100;

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

/** Clicks an object that is not the target, at a point the target does not share. */
async function clickWrongObject(page, objectId) {
  const point = (await tapPoints(page)).find((t) => !t.objectIds.includes(objectId));
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
  test.setTimeout(120_000);
  await startRound(page, 42, FAST_MS);

  // A round asks for every object of the room once.
  const { roundLength } = await state(page);
  expect(roundLength).toBe(objectCount('kitchen'));
  const asked = new Set();
  for (let n = 1; n <= roundLength; n++) {
    await waitForChallenge(page, n);
    const { challenge } = await state(page);
    asked.add(challenge);
    await clickObject(page, challenge);
  }
  expect(asked.size).toBe(roundLength);

  await expect(page.getByRole('heading', { name: 'Well done!' })).toBeVisible();
  await expect(page.getByTestId('summary')).toHaveText(
    `You found ${roundLength} out of ${roundLength}.`,
  );

  await page.getByRole('button', { name: 'Play again' }).click();
  await waitForChallenge(page, 1);
  await expect(page.getByTestId('score')).toHaveText('0 / 0');
});

test('a tap on shared pixels counts for every object there', async ({ page }) => {
  // In the living room, the stereo system's mask contains both speakers, which the
  // speaker's mask covers too. A round asks for every object once, so answer the others
  // until the stereo system comes up (the order depends on the seed and the manifest).
  test.setTimeout(120_000);
  await startRound(page, 17, FAST_MS, 'Living room');
  let n = 1;
  for (;;) {
    await waitForChallenge(page, n);
    const { challenge } = await state(page);
    if (challenge === 'stereo-system') break;
    await clickObject(page, challenge);
    n++;
  }
  await page.evaluate((ms) => window.__wordsTest.setNextDelay(ms), FEEDBACK_MS);

  const onSpeaker = await page.evaluate(() =>
    window.__wordsTest.sharedPoint(['speaker', 'stereo-system']),
  );
  expect(onSpeaker).not.toBeNull();
  await page.mouse.click(onSpeaker.x, onSpeaker.y);
  await expect(page.getByTestId('feedback')).toHaveText("Great job! That's the stereo system.");
  await expect(page.getByTestId('score')).toHaveText(`${n} / ${n}`);
});
