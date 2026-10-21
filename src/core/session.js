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
 * that have ended (answered correctly or revealed).
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
  let roundOver = false;

  function score() {
    const end = endedAt || now();
    return { correct, attempted, elapsedMs: startedAt ? end - startedAt : 0 };
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

    /** Starts the round with its first challenge. */
    start() {
      if (startedAt) throw new Error('The session has already started.');
      startedAt = now();
      startNext();
    },

    /**
     * @param {string} answer the object the child chose, or the text they typed
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
