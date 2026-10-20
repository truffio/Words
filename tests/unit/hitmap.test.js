import { describe, expect, it } from 'vitest';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../../src/core/display.js';
import {
  decodeHitmap,
  encodeHitmap,
  instanceAt,
  logicalToScreen,
  screenToLogical,
} from '../../src/core/hitmap.js';

describe('hit map encoding', () => {
  it('round-trips pixels through run-length encoding', () => {
    const pixels = Uint8Array.from([0, 0, 0, 1, 1, 2, 0, 0, 3, 3, 3, 3]);
    const encoded = encodeHitmap(pixels);
    expect(encoded.byteLength).toBe(5 * 4);
    expect(decodeHitmap(encoded, pixels.length)).toEqual(pixels);
  });

  it('splits runs longer than 65535 pixels', () => {
    const pixels = new Uint8Array(70000).fill(4);
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
    expect(decodeHitmap(padded.subarray(4), 3)).toEqual(Uint8Array.from([5, 5, 6]));
  });
});

describe('instanceAt', () => {
  // 4 × 3 hit map over the 2048 × 1536 logical canvas: each cell is 512 × 512.
  const hitmap = {
    width: 4,
    height: 3,
    pixels: Uint8Array.from([0, 1, 1, 0, 0, 1, 1, 2, 3, 3, 0, 2]),
  };

  it('returns the instance under a logical point', () => {
    expect(instanceAt(hitmap, 600, 10)).toBe(1);
    expect(instanceAt(hitmap, 2047, 1535)).toBe(2);
    expect(instanceAt(hitmap, 0, 1100)).toBe(3);
  });

  it('returns 0 for empty pixels and points outside the canvas', () => {
    expect(instanceAt(hitmap, 10, 10)).toBe(0);
    expect(instanceAt(hitmap, -1, 10)).toBe(0);
    expect(instanceAt(hitmap, LOGICAL_WIDTH, 10)).toBe(0);
    expect(instanceAt(hitmap, 10, LOGICAL_HEIGHT)).toBe(0);
    expect(instanceAt(hitmap, NaN, 10)).toBe(0);
  });

  it('treats cell edges consistently', () => {
    expect(instanceAt(hitmap, 511.9, 0)).toBe(0);
    expect(instanceAt(hitmap, 512, 0)).toBe(1);
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
