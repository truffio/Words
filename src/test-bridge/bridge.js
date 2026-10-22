import { LOGICAL_WIDTH } from '../core/display.js';
import { instancesAt, instancesOfCell, logicalToScreen } from '../core/hitmap.js';

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

    /**
     * Keeps feedback on screen for `ms` before the next challenge (null: the normal
     * delays), so slow machines can check it before it is cleared.
     * @param {number | null} ms
     */
    setNextDelay(ms) {
      app.setNextDelay(ms);
    },

    /** Current screen, activity, challenge, and score. */
    get state() {
      const challenge = app.session?.challenge ?? null;
      return {
        screen: app.shell.screen,
        room: app.roomId,
        menuOpen: app.shell.menuOpen,
        paused: app.session?.paused ?? false,
        activity: app.session?.activity ?? null,
        challengeNumber: challenge?.number ?? 0,
        roundLength: app.session?.roundLength ?? 0,
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

    /** Keys of every texture in memory, to check that leaving a room frees its own. */
    textureKeys() {
      return game.textures.getTextureKeys();
    },

    /**
     * Each instance's tap point in page (CSS pixel) coordinates, with every object found
     * there (`objectIds`, the most specific first): objects may share pixels, so a tap on
     * one can also count for another.
     */
    tapPoints() {
      const rect = game.canvas.getBoundingClientRect();
      const { layout, scene } = app;
      return (layout?.instances ?? []).map((instance) => {
        const [x, y] = logicalToScreen(instance.tap, rect);
        const found = scene?.hitmap ? instancesAt(scene.hitmap, ...instance.tap) : [];
        const objectIds = [...new Set(found.map((i) => layout.instances[i - 1].objectId))];
        return { name: instance.name, objectId: instance.objectId, objectIds, x, y };
      });
    },

    /**
     * A point in page coordinates where all the given objects share pixels (the middle
     * one of those hit-map pixels), or null if they never do.
     * @param {string[]} objectIds
     */
    sharedPoint(objectIds) {
      const { layout, scene } = app;
      const hitmap = scene?.hitmap;
      if (!hitmap) return null;
      const matches = [];
      for (let p = 0; p < hitmap.pixels.length; p++) {
        const found = instancesOfCell(hitmap, hitmap.pixels[p]).map(
          (i) => layout.instances[i - 1].objectId,
        );
        if (objectIds.every((id) => found.includes(id))) matches.push(p);
      }
      if (!matches.length) return null;
      const p = matches[Math.floor(matches.length / 2)];
      const scale = LOGICAL_WIDTH / hitmap.width;
      const logical = [
        ((p % hitmap.width) + 0.5) * scale,
        (Math.floor(p / hitmap.width) + 0.5) * scale,
      ];
      const [x, y] = logicalToScreen(logical, game.canvas.getBoundingClientRect());
      return { x, y };
    },

    /** A point in page coordinates from logical coordinates (e.g. an empty wall). */
    toScreen(x, y) {
      const [sx, sy] = logicalToScreen([x, y], game.canvas.getBoundingClientRect());
      return { x: sx, y: sy };
    },
  };
}
