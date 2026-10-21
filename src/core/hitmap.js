import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './display.js';

/**
 * The hit map stores, for each hit-map pixel, a *cell*: 0 for none, or an index into
 * the room's table of instance sets (`hitSets` in layout.json), because objects may
 * share pixels (a stereo system and its speakers). Cell i (1 ≤ i ≤ instance count) is
 * instance i alone; each set lists its instances from the smallest (most specific) to
 * the largest. It is stored run-length encoded: a sequence of little-endian Uint16
 * pairs [cell, count] covering the pixels in row-major order.
 */

/**
 * @param {Uint8Array | Uint16Array} pixels one cell per pixel, row-major
 * @returns {Uint8Array} encoded bytes
 */
export function encodeHitmap(pixels) {
  const pairs = [];
  let i = 0;
  while (i < pixels.length) {
    const value = pixels[i];
    let count = 0;
    while (i < pixels.length && pixels[i] === value && count < 0xffff) {
      count++;
      i++;
    }
    pairs.push(value, count);
  }
  const bytes = new Uint8Array(pairs.length * 2);
  const view = new DataView(bytes.buffer);
  pairs.forEach((n, k) => view.setUint16(k * 2, n, true));
  return bytes;
}

/**
 * @param {Uint8Array} bytes encoded hit map
 * @param {number} length expected number of pixels (width × height)
 * @returns {Uint16Array} one cell per pixel
 */
export function decodeHitmap(bytes, length) {
  if (bytes.byteLength % 4 !== 0) {
    throw new Error('Hit map data is not a whole number of [value, count] pairs.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pixels = new Uint16Array(length);
  let offset = 0;
  for (let k = 0; k < bytes.byteLength; k += 4) {
    const value = view.getUint16(k, true);
    const count = view.getUint16(k + 2, true);
    if (offset + count > length) {
      throw new Error('Hit map data is longer than the expected size.');
    }
    pixels.fill(value, offset, offset + count);
    offset += count;
  }
  if (offset !== length) {
    throw new Error(`Hit map data covers ${offset} pixels, expected ${length}.`);
  }
  return pixels;
}

/**
 * @typedef {object} HitmapGrid
 * @property {Uint8Array | Uint16Array} pixels one cell per pixel
 * @property {number} width
 * @property {number} height
 * @property {number[][]} [sets] instances of each cell; without it, cell i is instance i
 */

/**
 * Returns the cell at a point in logical coordinates, or 0 for none.
 * @param {HitmapGrid} hitmap
 * @param {number} x logical x (0–LOGICAL_WIDTH)
 * @param {number} y logical y (0–LOGICAL_HEIGHT)
 */
export function cellAt(hitmap, x, y) {
  if (!(x >= 0 && y >= 0 && x < LOGICAL_WIDTH && y < LOGICAL_HEIGHT)) {
    return 0;
  }
  const hx = Math.floor((x * hitmap.width) / LOGICAL_WIDTH);
  const hy = Math.floor((y * hitmap.height) / LOGICAL_HEIGHT);
  return hitmap.pixels[hy * hitmap.width + hx];
}

/**
 * The instances of a cell, most specific first.
 * @param {HitmapGrid} hitmap
 * @param {number} cell
 * @returns {number[]} 1-based instance indices
 */
export function instancesOfCell(hitmap, cell) {
  if (hitmap.sets) return hitmap.sets[cell] ?? [];
  return cell ? [cell] : [];
}

/**
 * Returns every instance at a point in logical coordinates, the most specific (the
 * smallest) first; empty for none.
 * @param {HitmapGrid} hitmap
 * @param {number} x logical x (0–LOGICAL_WIDTH)
 * @param {number} y logical y (0–LOGICAL_HEIGHT)
 * @returns {number[]} 1-based instance indices
 */
export function instancesAt(hitmap, x, y) {
  return instancesOfCell(hitmap, cellAt(hitmap, x, y));
}

/**
 * @typedef {object} Rect
 * @property {number} left
 * @property {number} top
 * @property {number} width
 * @property {number} height
 */

/**
 * Converts a logical point to screen coordinates, given the canvas's on-screen rectangle.
 * @param {[number, number]} point
 * @param {Rect} rect
 * @returns {[number, number]}
 */
export function logicalToScreen([x, y], rect) {
  return [
    rect.left + (x * rect.width) / LOGICAL_WIDTH,
    rect.top + (y * rect.height) / LOGICAL_HEIGHT,
  ];
}

/**
 * Converts a screen point to logical coordinates, given the canvas's on-screen rectangle.
 * @param {[number, number]} point
 * @param {Rect} rect
 * @returns {[number, number]}
 */
export function screenToLogical([x, y], rect) {
  return [
    ((x - rect.left) * LOGICAL_WIDTH) / rect.width,
    ((y - rect.top) * LOGICAL_HEIGHT) / rect.height,
  ];
}
