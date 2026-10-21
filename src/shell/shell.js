/**
 * The HTML/CSS user interface around the canvas: room selection, start screen with the
 * activity choice, prompt, feedback, word buttons (Look and identify), spelling input
 * (Recall and spell), score and timer (HUD), loading screen, and round summary.
 *
 * Screens: 'rooms' | 'start' | 'loading' | 'playing' | 'summary' (set on
 * #app[data-screen]).
 *
 * The game menu (a modal dialog opened by the menu icon on the game window) is
 * available on every screen where a room is open; it sits above the current screen.
 * The current activity is set on #app[data-activity]; elements with a `data-for`
 * activity are shown only during it.
 */

/** @typedef {import('../core/exercise.js').Activity} Activity */
/** @typedef {import('../core/exercise.js').Outcome} Outcome */

/** Written prompts while an object glows; Listen and find uses the word's own prompt. */
export const ACTIVITY_PROMPTS = {
  lookAndIdentify: 'What is this?',
  recallAndSpell: 'What is this? Type its name.',
};

/** @param {number} ms */
export function formatElapsed(ms) {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/**
 * The feedback message for an answer.
 * @param {Outcome} outcome
 * @param {string} label the target object's name
 * @param {Activity} activity
 */
export function feedbackMessage(outcome, label, activity) {
  if (outcome === 'correct') return `Great job! That's the ${label}.`;
  if (outcome === 'tryAgain') return 'Not quite. Try again!';
  if (activity === 'recallAndSpell') return `It's spelled: ${label}`;
  if (activity === 'lookAndIdentify') return `It's the ${label}.`;
  return `Here it is: the ${label}.`;
}

/**
 * The round summary sentence.
 * @param {{ correct: number, attempted: number }} score
 * @param {Activity} activity
 */
export function summaryMessage({ correct, attempted }, activity) {
  const verb = { listenAndFind: 'found', lookAndIdentify: 'named', recallAndSpell: 'spelled' };
  return `You ${verb[activity]} ${correct} out of ${attempted}.`;
}

/**
 * @typedef {object} RoomChoice
 * @property {string} id
 * @property {string} title
 * @property {string} thumbnail image URL
 */

/**
 * @param {HTMLElement} root the #app element
 * @param {object} handlers
 * @param {(roomId: string) => void} handlers.onChooseRoom
 * @param {() => void} handlers.onChangeRoom
 * @param {(activity: Activity) => void} handlers.onChooseActivity
 * @param {() => void} handlers.onPlayAgain
 * @param {() => void} handlers.onChangeActivity
 * @param {(objectId: string) => void} handlers.onChoose a word button was pressed
 * @param {(text: string) => void} handlers.onSpell a spelling was submitted
 * @param {() => { canRestart: boolean }} handlers.onOpenMenu the menu is opening
 * @param {() => void} handlers.onCloseMenu the menu closed without a choice
 */
export function createShell(
  root,
  {
    onChooseRoom,
    onChangeRoom,
    onChooseActivity,
    onPlayAgain,
    onChangeActivity,
    onChoose,
    onSpell,
    onOpenMenu,
    onCloseMenu,
  },
) {
  const $ = (id) => /** @type {HTMLElement} */ (root.querySelector(`#${id}`));
  const prompt = $('prompt');
  const feedback = $('feedback');
  const choices = $('choices');
  const spelling = /** @type {HTMLFormElement} */ ($('spelling'));
  const spellingInput = /** @type {HTMLInputElement} */ ($('spelling-input'));
  const checkButton = /** @type {HTMLButtonElement} */ ($('check-button'));
  const score = $('score');
  const timer = $('timer');
  const summaryText = $('summary-text');
  const summaryTime = $('summary-time');
  const roomList = $('room-list');
  const roomTitle = $('room-title');
  const loadingBar = $('loading-bar');
  const menu = /** @type {HTMLDialogElement} */ ($('menu'));
  const menuRestart = $('menu-restart');

  // The menu runs its choice once it has closed, so the game behind never sees the
  // menu half-open; closing without a choice (button or Escape) returns to the game.
  /** @type {(() => void) | null} */
  let menuChoice = null;
  const choose = (action) => () => {
    menuChoice = action;
    menu.close();
  };
  $('menu-button').addEventListener('click', () => {
    const { canRestart } = onOpenMenu();
    menuRestart.hidden = !canRestart;
    menuChoice = null;
    menu.showModal();
  });
  menuRestart.addEventListener('click', choose(onPlayAgain));
  $('menu-change-activity').addEventListener('click', choose(onChangeActivity));
  $('menu-change-room').addEventListener('click', choose(onChangeRoom));
  $('menu-close').addEventListener('click', choose(null));
  menu.addEventListener('close', () => {
    const action = menuChoice;
    menuChoice = null;
    (action ?? onCloseMenu)();
  });

  roomList.addEventListener('click', (event) => {
    const button = /** @type {HTMLElement} */ (event.target).closest('button');
    if (button) onChooseRoom(button.dataset.roomId);
  });
  for (const button of root.querySelectorAll('.change-room-button')) {
    button.addEventListener('click', onChangeRoom);
  }

  for (const button of root.querySelectorAll('button[data-activity]')) {
    button.addEventListener('click', () =>
      onChooseActivity(/** @type {Activity} */ (button.dataset.activity)),
    );
  }
  $('play-again-button').addEventListener('click', onPlayAgain);
  $('change-activity-button').addEventListener('click', onChangeActivity);

  choices.addEventListener('click', (event) => {
    const button = /** @type {HTMLElement} */ (event.target).closest('button');
    if (button && !(/** @type {HTMLButtonElement} */ (button).disabled)) {
      onChoose(button.dataset.objectId);
    }
  });

  spelling.addEventListener('submit', (event) => {
    event.preventDefault();
    // An empty box is not an answer; it would only cost the child a try.
    if (!spellingInput.readOnly && spellingInput.value.trim()) onSpell(spellingInput.value);
  });

  return {
    /** @param {'rooms' | 'start' | 'loading' | 'playing' | 'summary'} name */
    showScreen(name) {
      root.dataset.screen = name;
      const focus = {
        rooms: () => roomList.querySelector('button'),
        start: () => root.querySelector('button[data-activity]'),
        summary: () => $('play-again-button'),
      }[name]?.();
      /** @type {HTMLElement | null} */ (focus)?.focus();
    },

    /**
     * Fills the room selection screen: one button per room, with its picture and name.
     * @param {RoomChoice[]} rooms
     */
    showRooms(rooms) {
      roomList.replaceChildren(
        ...rooms.map(({ id, title, thumbnail }) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'room';
          button.dataset.roomId = id;
          const image = document.createElement('img');
          image.src = thumbnail;
          image.alt = '';
          const name = document.createElement('span');
          name.textContent = title;
          button.append(image, name);
          return button;
        }),
      );
    },

    /** @param {string} title the current room's name, shown above the activities */
    setRoomTitle(title) {
      roomTitle.textContent = title;
    },

    /** @param {number} progress 0 to 1 */
    setLoadingProgress(progress) {
      loadingBar.style.width = `${Math.round(progress * 100)}%`;
    },

    get screen() {
      return root.dataset.screen;
    },

    get menuOpen() {
      return menu.open;
    },

    /** @param {Activity} activity */
    setActivity(activity) {
      root.dataset.activity = activity;
    },

    /** @param {string} text */
    setPrompt(text) {
      prompt.textContent = text;
    },

    /**
     * @param {Outcome | null} outcome
     * @param {string} [label] the target object's name
     * @param {Activity} [activity]
     */
    setFeedback(outcome, label = '', activity = 'listenAndFind') {
      feedback.textContent = outcome ? feedbackMessage(outcome, label, activity) : '';
      feedback.dataset.outcome = outcome ?? '';
    },

    /**
     * Shows the word buttons of a Look and identify challenge.
     * @param {{ id: string, label: string }[]} words
     */
    showChoices(words) {
      choices.replaceChildren(
        ...words.map(({ id, label }) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'choice';
          button.dataset.objectId = id;
          button.textContent = label;
          return button;
        }),
      );
    },

    /**
     * Marks the chosen word button after an answer: a wrong word is crossed out and
     * disabled; once the challenge ends, the right word is marked and all are disabled.
     * @param {import('../core/exercise.js').AnswerResult} result
     */
    markChoice({ outcome, objectId, answeredId }) {
      for (const button of choices.querySelectorAll('button')) {
        const id = button.dataset.objectId;
        if (id === answeredId && outcome !== 'correct') button.dataset.state = 'wrong';
        if (id === objectId && outcome !== 'tryAgain') {
          button.dataset.state = outcome === 'correct' ? 'correct' : 'answer';
        }
        if (button.dataset.state === 'wrong' || outcome !== 'tryAgain') button.disabled = true;
      }
    },

    clearChoices() {
      choices.replaceChildren();
    },

    /** Empties and enables the spelling box for a new challenge. */
    resetSpelling() {
      spellingInput.value = '';
      spellingInput.readOnly = false;
      spellingInput.dataset.outcome = '';
      checkButton.disabled = false;
    },

    focusSpelling() {
      spellingInput.focus();
    },

    /**
     * Shows the result of a spelling. After *try again* the text stays, selected, so the
     * child can fix or retype it; a reveal replaces it with the correct spelling.
     * @param {Outcome} outcome
     * @param {string} label the correct spelling
     */
    markSpelling(outcome, label) {
      spellingInput.dataset.outcome = outcome;
      if (outcome === 'tryAgain') {
        spellingInput.select();
        return;
      }
      if (outcome === 'reveal') spellingInput.value = label;
      spellingInput.readOnly = true;
      checkButton.disabled = true;
    },

    /** @param {{ correct: number, attempted: number }} s */
    setScore({ correct, attempted }) {
      score.textContent = `${correct} / ${attempted}`;
    },

    /** @param {number} ms */
    setElapsed(ms) {
      timer.textContent = formatElapsed(ms);
    },

    /**
     * @param {{ correct: number, attempted: number, elapsedMs: number }} s
     * @param {Activity} activity
     */
    showSummary(s, activity) {
      summaryText.textContent = summaryMessage(s, activity);
      summaryTime.textContent = `Time: ${formatElapsed(s.elapsedMs)}`;
      this.showScreen('summary');
    },
  };
}
