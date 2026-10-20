/**
 * Listen-and-find exercise: the game names an object, the child taps it.
 *
 * Rules (TECHNICAL.md §4, proposed gameplay rules):
 * - A round has `roundLength` challenges drawn from the eligible objects. No object
 *   repeats while unused objects remain, and never twice in a row.
 * - A wrong answer gives another try; after `maxWrongAttempts` wrong answers the
 *   answer is revealed and the challenge ends.
 * - A challenge counts as correct when it ends without a reveal.
 */

export const DEFAULT_ROUND_LENGTH = 10;
export const DEFAULT_MAX_WRONG_ATTEMPTS = 2;

/** @typedef {'correct' | 'tryAgain' | 'reveal'} Outcome */

/**
 * @typedef {object} Challenge
 * @property {number} number 1-based position in the round
 * @property {string} objectId the object to find
 * @property {number} wrongAttempts
 * @property {boolean} done
 */

/**
 * @typedef {object} AnswerResult
 * @property {Outcome} outcome
 * @property {string} objectId the target object
 * @property {string} answeredId the object the child chose
 * @property {boolean} done whether the challenge has ended
 */

/**
 * @param {object} options
 * @param {string[]} options.objectIds eligible object IDs (at least one)
 * @param {import('./rng.js').Rng} options.rng
 * @param {number} [options.roundLength]
 * @param {number} [options.maxWrongAttempts]
 */
export function createListenAndFind({
  objectIds,
  rng,
  roundLength = DEFAULT_ROUND_LENGTH,
  maxWrongAttempts = DEFAULT_MAX_WRONG_ATTEMPTS,
}) {
  if (objectIds.length === 0) {
    throw new Error('Listen and find needs at least one eligible object.');
  }

  /** @type {string[]} */
  let bag = [];
  /** @type {string | null} */
  let lastPicked = null;
  /** @type {Challenge | null} */
  let current = null;
  let started = 0;

  function pick() {
    if (bag.length === 0) {
      bag = rng.shuffle(objectIds);
      // Avoid the same object twice in a row across refills.
      if (bag.length > 1 && bag[bag.length - 1] === lastPicked) {
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
    }
    lastPicked = bag.pop();
    return lastPicked;
  }

  return {
    roundLength,

    /** The current challenge, or null before the first one and after the round. */
    get current() {
      return current;
    },

    /**
     * Starts the next challenge.
     * @returns {Challenge | null} null when the round is over
     */
    next() {
      if (current && !current.done) {
        throw new Error('The current challenge has not ended yet.');
      }
      if (started >= roundLength) {
        current = null;
        return null;
      }
      started++;
      current = { number: started, objectId: pick(), wrongAttempts: 0, done: false };
      return current;
    },

    /**
     * Evaluates the object the child chose for the current challenge.
     * @param {string} answeredId
     * @returns {AnswerResult}
     */
    answer(answeredId) {
      if (!current || current.done) {
        throw new Error('There is no open challenge to answer.');
      }
      /** @type {Outcome} */
      let outcome;
      if (answeredId === current.objectId) {
        outcome = 'correct';
      } else {
        current.wrongAttempts++;
        outcome = current.wrongAttempts >= maxWrongAttempts ? 'reveal' : 'tryAgain';
      }
      current.done = outcome !== 'tryAgain';
      return { outcome, objectId: current.objectId, answeredId, done: current.done };
    },
  };
}
