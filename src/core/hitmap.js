import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './display.js';

/**
 * The hit map stores, for each hit-map pixel, the index of the object instance that
 * owns it (1–255) or 0 for none. It is stored run-length encoded: a sequence of
 * little-endian Uint16 pairs [value, count] covering the pixels in row-major order.
 */

/**
 * @param {Uint8Array} pixels one byte per pixel, row-major
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
 * @returns {Uint8Array} one byte per pixel
 */
export function decodeHitmap(bytes, length) {
  if (bytes.byteLength % 4 !== 0) {
    throw new Error('Hit map data is not a whole number of [value, count] pairs.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pixels = new Uint8Array(length);
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
 * @property {Uint8Array} pixels
 * @property {number} width
 * @property {number} height
 */

/**
 * Returns the instance index at a point in logical coordinates, or 0 for none.
 * @param {HitmapGrid} hitmap
 * @param {number} x logical x (0–LOGICAL_WIDTH)
 * @param {number} y logical y (0–LOGICAL_HEIGHT)
 */
export function instanceAt(hitmap, x, y) {
  if (!(x >= 0 && y >= 0 && x < LOGICAL_WIDTH && y < LOGICAL_HEIGHT)) {
    return 0;
  }
  const hx = Math.floor((x * hitmap.width) / LOGICAL_WIDTH);
  const hy = Math.floor((y * hitmap.height) / LOGICAL_HEIGHT);
  return hitmap.pixels[hy * hitmap.width + hx];
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
