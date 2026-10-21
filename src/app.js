import {
  createListenAndFind,
  createLookAndIdentify,
  createRecallAndSpell,
} from './core/exercise.js';
import { createRng, randomSeed } from './core/rng.js';
import { createSession } from './core/session.js';
import { getRoom, roomChoices } from './game/content.js';
import { loadRoom } from './game/main.js';
import { prefetchRoom } from './game/prefetch.js';
import { ACTIVITY_PROMPTS, createShell } from './shell/shell.js';

/** How long after a room opens the next room is prefetched, to leave the network free. */
const PREFETCH_DELAY_MS = 2000;

/** How long after the menu closes a challenge that had ended moves on. */
const RESUME_DELAY_MS = 600;

/** How long feedback stays on screen before the next challenge. */
const NEXT_DELAY_MS = { correct: 1200, reveal: 2400 };

/** Exercise factories by activity; `layout` is the room's built layout.json. */
const EXERCISES = {
  listenAndFind: (room, rng) =>
    createListenAndFind({ objectIds: room.objects.map((o) => o.id), rng }),
  lookAndIdentify: (room, rng, layout) =>
    createLookAndIdentify({ objects: room.objects, parts: layout.parts, rng }),
  recallAndSpell: (room, rng) => createRecallAndSpell({ objects: room.objects, rng }),
};

/**
 * Connects the shell (DOM), the game (Phaser), and the core rules: loads the chosen
 * room, runs rounds of the chosen activity, and keeps the HUD in sync with the session.
 *
 * The child first chooses a room, then freely among the three activities (open
 * decision H). The round summary offers to change activity or room.
 * @param {object} options
 * @param {import('phaser').Game} options.game
 * @param {HTMLElement} options.root the #app element
 */
export function createApp({ game, root }) {
  /** @type {number | null} fixed seed (tests), or null for a random one each round */
  let seed = null;
  /** @type {number | null} fixed feedback time (tests), or null for NEXT_DELAY_MS */
  let nextDelay = null;
  /** @type {import('./core/content.js').RoomContent | null} */
  let room = null;
  let roomView = null;
  let prefetchId = 0;
  /** @type {import('./core/exercise.js').Activity} */
  let activity = 'listenAndFind';
  let session = null;
  let unsubscribe = [];
  let timerId = 0;
  let nextId = 0;
  /** True when the menu opened while a challenge was waiting to move on. */
  let nextPending = false;

  const shell = createShell(root, {
    onChooseRoom: (roomId) => openRoom(roomId),
    onChangeRoom: () => {
      stopRound();
      shell.showScreen('rooms');
    },
    onChooseActivity: (chosen) => start(chosen),
    onPlayAgain: () => startRound(),
    onChangeActivity: () => {
      stopRound();
      shell.showScreen('start');
    },
    onChoose: (objectId) => answer(objectId),
    onSpell: (text) => answer(text),
    onOpenMenu: () => {
      // Pause the round: stop the clock and hold back the next challenge.
      session?.pause();
      if (nextId) {
        clearTimeout(nextId);
        nextId = 0;
        nextPending = true;
      }
      return { canRestart: !!session };
    },
    onCloseMenu: () => {
      session?.resume();
      if (nextPending) {
        nextPending = false;
        scheduleNext(RESUME_DELAY_MS);
      }
      if (shell.screen === 'playing' && activity === 'recallAndSpell') shell.focusSpelling();
    },
  });

  /**
   * Shows a room, loading it unless it is already open, then offers the activities.
   * @param {string} roomId
   */
  async function openRoom(roomId) {
    if (room?.id !== roomId || !roomView) {
      stopRound();
      clearTimeout(prefetchId);
      shell.setLoadingProgress(0);
      shell.showScreen('loading');
      room = getRoom(roomId);
      // A new room starts with no activity to restart.
      session = null;
      roomView = null;
      roomView = await loadRoom(game, roomId, (p) => shell.setLoadingProgress(p));
      const debug = new URLSearchParams(location.search).get('debug');
      if (debug) showDebugView(debug);
      const next = nextRoomId(roomId);
      if (next !== roomId) prefetchId = setTimeout(() => prefetchRoom(next), PREFETCH_DELAY_MS);
    }
    shell.setRoomTitle(room.title);
    shell.showScreen('start');
  }

  /** The room after this one in the list, the most likely next choice. */
  function nextRoomId(roomId) {
    const index = roomChoices.findIndex((r) => r.id === roomId);
    return roomChoices[(index + 1) % roomChoices.length].id;
  }

  /** @param {import('./core/exercise.js').Activity} chosen */
  function start(chosen) {
    activity = chosen;
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

  /** @param {number} ms delay before the next challenge (or the end of the round) */
  function scheduleNext(ms) {
    nextId = setTimeout(() => {
      nextId = 0;
      session.next();
    }, ms);
  }

  function stopRound() {
    unsubscribe.forEach((off) => off());
    unsubscribe = [];
    clearInterval(timerId);
    clearTimeout(nextId);
    nextId = 0;
    nextPending = false;
    roomView?.scene.detachSession();
  }

  function startRound() {
    stopRound();
    const rng = createRng(seed ?? randomSeed());
    const exercise = EXERCISES[activity](room, rng, roomView.layout);
    session = createSession({ roomId: room.id, exercise });
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
        if (result.done) scheduleNext(nextDelay ?? NEXT_DELAY_MS[result.outcome]);
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

  shell.showRooms(roomChoices);
  shell.showScreen('rooms');

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
    get roomId() {
      return roomView ? room.id : null;
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
