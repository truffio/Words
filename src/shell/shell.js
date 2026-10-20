/**
 * The HTML/CSS user interface around the canvas: start screen, prompt, feedback,
 * score and timer (HUD), loading screen, and round summary.
 *
 * Screens: 'start' | 'loading' | 'playing' | 'summary' (set on #app[data-screen]).
 */

/** @param {number} ms */
export function formatElapsed(ms) {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/**
 * @param {HTMLElement} root the #app element
 * @param {{ onStart: () => void, onPlayAgain: () => void }} handlers
 */
export function createShell(root, { onStart, onPlayAgain }) {
  const $ = (id) => /** @type {HTMLElement} */ (root.querySelector(`#${id}`));
  const prompt = $('prompt');
  const feedback = $('feedback');
  const score = $('score');
  const timer = $('timer');
  const summaryText = $('summary-text');
  const summaryTime = $('summary-time');

  $('start-button').addEventListener('click', onStart);
  $('play-again-button').addEventListener('click', onPlayAgain);

  return {
    /** @param {'start' | 'loading' | 'playing' | 'summary'} name */
    showScreen(name) {
      root.dataset.screen = name;
      const button =
        name === 'start' ? 'start-button' : name === 'summary' ? 'play-again-button' : null;
      if (button) $(button).focus();
    },

    get screen() {
      return root.dataset.screen;
    },

    /** @param {string} text */
    setPrompt(text) {
      prompt.textContent = text;
    },

    /**
     * @param {import('../core/exercise.js').Outcome | null} outcome
     * @param {string} [label] the target object's name
     */
    setFeedback(outcome, label = '') {
      const messages = {
        correct: `Great job! That's the ${label}.`,
        tryAgain: 'Not quite. Try again!',
        reveal: `Here it is: the ${label}.`,
      };
      feedback.textContent = outcome ? messages[outcome] : '';
      feedback.dataset.outcome = outcome ?? '';
    },

    /** @param {{ correct: number, attempted: number }} s */
    setScore({ correct, attempted }) {
      score.textContent = `${correct} / ${attempted}`;
    },

    /** @param {number} ms */
    setElapsed(ms) {
      timer.textContent = formatElapsed(ms);
    },

    /** @param {{ correct: number, attempted: number, elapsedMs: number }} s */
    showSummary({ correct, attempted, elapsedMs }) {
      summaryText.textContent = `You found ${correct} out of ${attempted}.`;
      summaryTime.textContent = `Time: ${formatElapsed(elapsedMs)}`;
      this.showScreen('summary');
    },
  };
}
