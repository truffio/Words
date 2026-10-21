import { logicalToScreen } from '../core/hitmap.js';

/**
 * Test-only bridge for Playwright, exposed as `window.__wordsTest`. Lets tests read the
 * current challenge and tap objects at real screen positions computed from the layout,
 * without hardcoded pixel coordinates.
 * @param {ReturnType<typeof import('../app.js').createApp>} app
 * @param {import('phaser').Game} game
 */
export function installTestBridge(app, game) {
  window.__wordsTest = {
    /** @param {number | null} seed fixed RNG seed for the next rounds */
    setSeed(seed) {
      app.setSeed(seed);
    },

    /** Current screen, activity, challenge, and score. */
    get state() {
      const challenge = app.session?.challenge ?? null;
      return {
        screen: app.shell.screen,
        activity: app.session?.activity ?? null,
        challengeNumber: challenge?.number ?? 0,
        challenge: challenge?.objectId ?? null,
        choices: challenge?.choices ?? null,
        highlighted: app.scene?.highlighted ?? null,
        awaitingAnswer: app.session?.awaitingAnswer ?? false,
        score: app.session?.score() ?? null,
      };
    },

    /** An object's words: label and accepted spellings. */
    word(objectId) {
      const object = app.room?.byId.get(objectId);
      return object ? { label: object.label, accepted: object.accepted } : null;
    },

    /** Each instance's tap point in page (CSS pixel) coordinates. */
    tapPoints() {
      const rect = game.canvas.getBoundingClientRect();
      return (app.layout?.instances ?? []).map((instance) => {
        const [x, y] = logicalToScreen(instance.tap, rect);
        return { name: instance.name, objectId: instance.objectId, x, y };
      });
    },

    /** A point in page coordinates from logical coordinates (e.g. an empty wall). */
    toScreen(x, y) {
      const [sx, sy] = logicalToScreen([x, y], game.canvas.getBoundingClientRect());
      return { x: sx, y: sy };
    },
  };
}
