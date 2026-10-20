/**
 * @typedef {object} Rng
 * @property {() => number} next Float in [0, 1).
 * @property {(n: number) => number} int Integer in [0, n).
 * @property {<T>(items: T[]) => T[]} shuffle New array with the items in random order.
 */

/**
 * Seedable pseudo-random generator (mulberry32). The same seed always gives the
 * same sequence, so rounds can be replayed in tests and bug reports.
 * @param {number} seed
 * @returns {Rng}
 */
export function createRng(seed) {
  let state = seed >>> 0;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(n) {
    return Math.floor(next() * n);
  }

  function shuffle(items) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  return { next, int, shuffle };
}

/** A seed that differs on each page load, for normal play. */
export function randomSeed() {
  return Math.floor(Math.random() * 4294967296);
}
