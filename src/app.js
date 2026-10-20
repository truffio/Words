import { createListenAndFind } from './core/exercise.js';
import { createRng, randomSeed } from './core/rng.js';
import { createSession } from './core/session.js';
import { getRoom } from './game/content.js';
import { loadRoom } from './game/main.js';
import { createShell } from './shell/shell.js';

/** How long feedback stays on screen before the next challenge. */
const NEXT_DELAY_MS = { correct: 1200, reveal: 2400 };

/**
 * Connects the shell (DOM), the game (Phaser), and the core rules: loads a room,
 * runs rounds, and keeps the HUD in sync with the session.
 * @param {object} options
 * @param {import('phaser').Game} options.game
 * @param {HTMLElement} options.root the #app element
 * @param {string} [options.roomId]
 */
export function createApp({ game, root, roomId = 'kitchen' }) {
  /** @type {number | null} fixed seed (tests), or null for a random one each round */
  let seed = null;
  let room = null;
  let roomView = null;
  let session = null;
  let unsubscribe = [];
  let timerId = 0;
  let nextId = 0;

  const shell = createShell(root, {
    onStart: () => start(),
    onPlayAgain: () => startRound(),
  });

  async function start() {
    shell.showScreen('loading');
    room = getRoom(roomId);
    roomView = await loadRoom(game, roomId);
    const debug = new URLSearchParams(location.search).get('debug');
    if (debug) showDebugView(debug);
    startRound();
  }

  /** @param {string} view 'hits' or 'cutouts' */
  function showDebugView(view) {
    // Compiled out of production builds.
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      import('./game/debug-hits.js').then(({ showCutouts, showHitRegions }) => {
        if (view === 'hits') showHitRegions(roomView.scene);
        if (view === 'cutouts') showCutouts(roomView.scene);
      });
    }
  }

  function stopRound() {
    unsubscribe.forEach((off) => off());
    unsubscribe = [];
    clearInterval(timerId);
    clearTimeout(nextId);
  }

  function startRound() {
    stopRound();
    const rng = createRng(seed ?? randomSeed());
    const exercise = createListenAndFind({ objectIds: room.objects.map((o) => o.id), rng });
    session = createSession({ roomId, exercise });

    unsubscribe = [
      session.on('challengeStarted', ({ challenge, score }) => {
        shell.setPrompt(room.byId.get(challenge.objectId).prompt);
        shell.setFeedback(null);
        shell.setScore(score);
      }),
      session.on('answerEvaluated', ({ result, score }) => {
        shell.setFeedback(result.outcome, room.byId.get(result.objectId).label);
        shell.setScore(score);
        if (result.done) nextId = setTimeout(() => session.next(), NEXT_DELAY_MS[result.outcome]);
      }),
      session.on('roundEnded', ({ score }) => {
        clearInterval(timerId);
        shell.setPrompt('');
        shell.setFeedback(null);
        shell.setElapsed(score.elapsedMs);
        shell.showSummary(score);
      }),
    ];

    roomView.scene.attachSession(session);
    shell.showScreen('playing');
    shell.setElapsed(0);
    timerId = setInterval(() => shell.setElapsed(session.score().elapsedMs), 500);
    session.start();
  }

  shell.showScreen('start');

  return {
    shell,
    get session() {
      return session;
    },
    get layout() {
      return roomView?.layout ?? null;
    },
    /** @param {number | null} value fixed seed for the next rounds */
    setSeed(value) {
      seed = value;
    },
  };
}
