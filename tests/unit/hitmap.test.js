import { describe, expect, it } from 'vitest';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../../src/core/display.js';
import {
  decodeHitmap,
  encodeHitmap,
  cellAt,
  instancesAt,
  logicalToScreen,
  screenToLogical,
} from '../../src/core/hitmap.js';

describe('hit map encoding', () => {
  it('round-trips pixels through run-length encoding', () => {
    const pixels = Uint16Array.from([0, 0, 0, 1, 1, 2, 0, 0, 3, 3, 3, 3]);
    const encoded = encodeHitmap(pixels);
    expect(encoded.byteLength).toBe(5 * 4);
    expect(decodeHitmap(encoded, pixels.length)).toEqual(pixels);
  });

  it('splits runs longer than 65535 pixels', () => {
    const pixels = new Uint16Array(70000).fill(4);
    const encoded = encodeHitmap(pixels);
    expect(encoded.byteLength).toBe(2 * 4);
    expect(decodeHitmap(encoded, pixels.length)).toEqual(pixels);
  });

  it('rejects data that does not match the expected size', () => {
    const encoded = encodeHitmap(new Uint8Array(10));
    expect(() => decodeHitmap(encoded, 11)).toThrow(/expected 11/);
    expect(() => decodeHitmap(encoded, 9)).toThrow(/longer/);
    expect(() => decodeHitmap(new Uint8Array(3), 1)).toThrow(/pairs/);
  });

  it('decodes from a byte view with an offset', () => {
    const encoded = encodeHitmap(Uint8Array.from([5, 5, 6]));
    const padded = new Uint8Array(encoded.byteLength + 4);
    padded.set(encoded, 4);
    expect(decodeHitmap(padded.subarray(4), 3)).toEqual(Uint16Array.from([5, 5, 6]));
  });

  it('keeps cells above 255 (shared pixels in rooms with many instances)', () => {
    const pixels = Uint16Array.from([0, 300, 300, 65535]);
    expect(decodeHitmap(encodeHitmap(pixels), 4)).toEqual(pixels);
  });
});

describe('cellAt', () => {
  // 4 × 3 hit map over the 2048 × 1536 logical canvas: each pixel is 512 × 512.
  const hitmap = {
    width: 4,
    height: 3,
    pixels: Uint16Array.from([0, 1, 1, 0, 0, 1, 1, 2, 3, 3, 0, 2]),
  };

  it('returns the cell under a logical point', () => {
    expect(cellAt(hitmap, 600, 10)).toBe(1);
    expect(cellAt(hitmap, 2047, 1535)).toBe(2);
    expect(cellAt(hitmap, 0, 1100)).toBe(3);
  });

  it('returns 0 for empty pixels and points outside the canvas', () => {
    expect(cellAt(hitmap, 10, 10)).toBe(0);
    expect(cellAt(hitmap, -1, 10)).toBe(0);
    expect(cellAt(hitmap, LOGICAL_WIDTH, 10)).toBe(0);
    expect(cellAt(hitmap, 10, LOGICAL_HEIGHT)).toBe(0);
    expect(cellAt(hitmap, NaN, 10)).toBe(0);
  });

  it('treats pixel edges consistently', () => {
    expect(cellAt(hitmap, 511.9, 0)).toBe(0);
    expect(cellAt(hitmap, 512, 0)).toBe(1);
  });
});

describe('instancesAt', () => {
  // Instance 1 is a stereo system, 2 its speaker; cell 3 is where they overlap.
  const hitmap = {
    width: 2,
    height: 1,
    pixels: Uint16Array.from([1, 3]),
    sets: [[], [1], [2], [2, 1]],
  };

  it('returns every instance under a point, the most specific first', () => {
    expect(instancesAt(hitmap, 100, 100)).toEqual([1]);
    expect(instancesAt(hitmap, 1500, 100)).toEqual([2, 1]);
  });

  it('returns nothing outside every object', () => {
    expect(instancesAt(hitmap, -1, 100)).toEqual([]);
    expect(instancesAt({ ...hitmap, pixels: Uint16Array.from([0, 0]) }, 100, 100)).toEqual([]);
  });

  it('reads a map without a set table as one instance per cell', () => {
    const plain = { width: 2, height: 1, pixels: Uint16Array.from([0, 2]) };
    expect(instancesAt(plain, 1500, 100)).toEqual([2]);
    expect(instancesAt(plain, 100, 100)).toEqual([]);
  });
});

describe('coordinate conversion', () => {
  const rect = { left: 100, top: 50, width: 1024, height: 768 };

  it('maps logical points to the canvas on screen', () => {
    expect(logicalToScreen([0, 0], rect)).toEqual([100, 50]);
    expect(logicalToScreen([2048, 1536], rect)).toEqual([1124, 818]);
    expect(logicalToScreen([1024, 768], rect)).toEqual([612, 434]);
  });

  it('is the inverse of screenToLogical', () => {
    const point = [733, 1201];
    expect(screenToLogical(logicalToScreen(point, rect), rect)).toEqual(point);
  });
});
