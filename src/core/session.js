import { createEmitter } from './events.js';

/**
 * A play session for one round of one activity in one room, held in memory only.
 *
 * Events:
 * - `challengeStarted` { challenge, score }
 * - `answerEvaluated`  { result, challenge, score }
 * - `roundEnded`       { score }
 *
 * `score` is { correct, attempted, elapsedMs }, where `attempted` counts challenges
 * that have ended (answered correctly or revealed). Time spent paused (the game menu
 * is open) does not count.
 */

/**
 * @param {object} options
 * @param {string} options.roomId
 * @param {import('./exercise.js').Exercise} options.exercise
 * @param {() => number} [options.now] clock in milliseconds
 */
export function createSession({ roomId, exercise, now = Date.now }) {
  const emitter = createEmitter();
  let correct = 0;
  let attempted = 0;
  let startedAt = 0;
  let endedAt = 0;
  let pausedAt = 0;
  let pausedMs = 0;
  let roundOver = false;

  function score() {
    const end = endedAt || pausedAt || now();
    return { correct, attempted, elapsedMs: startedAt ? end - startedAt - pausedMs : 0 };
  }

  function startNext() {
    const challenge = exercise.next();
    if (challenge) {
      emitter.emit('challengeStarted', { challenge, score: score() });
    } else {
      roundOver = true;
      endedAt = now();
      emitter.emit('roundEnded', { score: score() });
    }
  }

  return {
    roomId,
    activity: exercise.activity,
    /** Challenges in the round. */
    roundLength: exercise.roundLength,
    on: emitter.on,
    score,

    get challenge() {
      return exercise.current;
    },

    /** True while a challenge is waiting for an answer. */
    get awaitingAnswer() {
      return !roundOver && !!exercise.current && !exercise.current.done;
    },

    get roundOver() {
      return roundOver;
    },

    get paused() {
      return pausedAt !== 0;
    },

    /** Stops the clock, e.g. while the game menu is open. */
    pause() {
      if (startedAt && !roundOver && !pausedAt) pausedAt = now();
    },

    /** Restarts the clock after a pause. */
    resume() {
      if (!pausedAt) return;
      pausedMs += now() - pausedAt;
      pausedAt = 0;
    },

    /** Starts the round with its first challenge. */
    start() {
      if (startedAt) throw new Error('The session has already started.');
      startedAt = now();
      startNext();
    },

    /**
     * @param {string | string[]} answer the object the child chose (or every object at
     *   the tapped point), or the text they typed
     * @returns {import('./exercise.js').AnswerResult}
     */
    answer(answer) {
      const result = exercise.answer(answer);
      if (result.done) {
        attempted++;
        if (result.outcome === 'correct') correct++;
      }
      emitter.emit('answerEvaluated', { result, challenge: exercise.current, score: score() });
      return result;
    },

    /** Moves on after a challenge has ended: next challenge, or the end of the round. */
    next() {
      if (roundOver) return;
      startNext();
    },
  };
}
