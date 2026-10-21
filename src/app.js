import {
  createListenAndFind,
  createLookAndIdentify,
  createRecallAndSpell,
} from './core/exercise.js';
import { createRng, randomSeed } from './core/rng.js';
import { createSession } from './core/session.js';
import { getRoom } from './game/content.js';
import { loadRoom } from './game/main.js';
import { ACTIVITY_PROMPTS, createShell } from './shell/shell.js';

/** How long feedback stays on screen before the next challenge. */
const NEXT_DELAY_MS = { correct: 1200, reveal: 2400 };

/** Exercise factories by activity. */
const EXERCISES = {
  listenAndFind: (room, rng) =>
    createListenAndFind({ objectIds: room.objects.map((o) => o.id), rng }),
  lookAndIdentify: (room, rng) => createLookAndIdentify({ objects: room.objects, rng }),
  recallAndSpell: (room, rng) => createRecallAndSpell({ objects: room.objects, rng }),
};

/**
 * Connects the shell (DOM), the game (Phaser), and the core rules: loads a room,
 * runs rounds of the chosen activity, and keeps the HUD in sync with the session.
 *
 * The child chooses freely among the three activities on the start screen, and can
 * change activity from the round summary (open decision H).
 * @param {object} options
 * @param {import('phaser').Game} options.game
 * @param {HTMLElement} options.root the #app element
 * @param {string} [options.roomId]
 */
export function createApp({ game, root, roomId = 'kitchen' }) {
  /** @type {number | null} fixed seed (tests), or null for a random one each round */
  let seed = null;
  /** @type {number | null} fixed feedback time (tests), or null for NEXT_DELAY_MS */
  let nextDelay = null;
  let room = null;
  let roomView = null;
  /** @type {import('./core/exercise.js').Activity} */
  let activity = 'listenAndFind';
  let session = null;
  let unsubscribe = [];
  let timerId = 0;
  let nextId = 0;

  const shell = createShell(root, {
    onChooseActivity: (chosen) => start(chosen),
    onPlayAgain: () => startRound(),
    onChangeActivity: () => {
      stopRound();
      shell.showScreen('start');
    },
    onChoose: (objectId) => answer(objectId),
    onSpell: (text) => answer(text),
  });

  /** @param {import('./core/exercise.js').Activity} chosen */
  async function start(chosen) {
    activity = chosen;
    if (!roomView) {
      shell.showScreen('loading');
      room = getRoom(roomId);
      roomView = await loadRoom(game, roomId);
      const debug = new URLSearchParams(location.search).get('debug');
      if (debug) showDebugView(debug);
    }
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

  /** Answers from the DOM (word buttons, spelling); taps go to the session directly. */
  function answer(value) {
    if (session?.awaitingAnswer) session.answer(value);
  }

  function stopRound() {
    unsubscribe.forEach((off) => off());
    unsubscribe = [];
    clearInterval(timerId);
    clearTimeout(nextId);
    roomView?.scene.detachSession();
  }

  function startRound() {
    stopRound();
    const rng = createRng(seed ?? randomSeed());
    session = createSession({ roomId, exercise: EXERCISES[activity](room, rng) });
    const label = (id) => room.byId.get(id).label;

    unsubscribe = [
      session.on('challengeStarted', ({ challenge, score }) => {
        shell.setPrompt(ACTIVITY_PROMPTS[activity] ?? room.byId.get(challenge.objectId).prompt);
        shell.setFeedback(null);
        shell.setScore(score);
        if (activity === 'lookAndIdentify') {
          shell.showChoices(challenge.choices.map((id) => ({ id, label: label(id) })));
        }
        if (activity === 'recallAndSpell') {
          shell.resetSpelling();
          shell.focusSpelling();
        }
      }),
      session.on('answerEvaluated', ({ result, score }) => {
        shell.setFeedback(result.outcome, label(result.objectId), activity);
        shell.setScore(score);
        if (activity === 'lookAndIdentify') shell.markChoice(result);
        if (activity === 'recallAndSpell')
          shell.markSpelling(result.outcome, label(result.objectId));
        if (result.done)
          nextId = setTimeout(() => session.next(), nextDelay ?? NEXT_DELAY_MS[result.outcome]);
      }),
      session.on('roundEnded', ({ score }) => {
        clearInterval(timerId);
        shell.setPrompt('');
        shell.setFeedback(null);
        shell.clearChoices();
        shell.setElapsed(score.elapsedMs);
        shell.showSummary(score, activity);
      }),
    ];

    shell.setActivity(activity);
    shell.clearChoices();
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
    get room() {
      return room;
    },
    get layout() {
      return roomView?.layout ?? null;
    },
    get scene() {
      return roomView?.scene ?? null;
    },
    /** @param {number | null} value fixed seed for the next rounds */
    setSeed(value) {
      seed = value;
    },
    /** @param {number | null} ms fixed feedback time before the next challenge */
    setNextDelay(ms) {
      nextDelay = ms;
    },
  };
}
