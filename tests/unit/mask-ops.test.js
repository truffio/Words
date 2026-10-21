import { describe, expect, it } from 'vitest';
import {
  addInto,
  area,
  compose,
  floodFill,
  iou,
  maskToRgba,
  nextInstanceName,
  overlayPixels,
  rgbaToMask,
} from '../../tools/mask-tool/mask-ops.js';

/** RGBA pixels from rows of single-letter colours. */
function painting(rows) {
  const colours = { w: [255, 255, 255], k: [20, 20, 20], r: [220, 40, 40], p: [230, 60, 60] };
  return Uint8Array.from(
    rows
      .join('')
      .split('')
      .flatMap((c) => [...colours[c], 255]),
  );
}
const mask = (rows) => Uint8Array.from(rows.join('').split(''), (c) => (c === '#' ? 1 : 0));
const toRows = (m, width) =>
  Array.from({ length: m.length / width }, (_, y) =>
    [...m.slice(y * width, (y + 1) * width)].map((v) => (v ? '#' : '.')).join(''),
  );

describe('floodFill', () => {
  // A red square outlined in black on white, like a cartoon object.
  const rows = ['wwwwww', 'wkkkkw', 'wkrrkw', 'wkrpkw', 'wkkkkw', 'wwwwww'];
  const rgba = painting(rows);

  it('fills a flat-coloured area and stops at the outline', () => {
    expect(toRows(floodFill(rgba, 6, 6, 2, 2, 10), 6)).toEqual([
      '......',
      '......',
      '..##..',
      '..#...',
      '......',
      '......',
    ]);
  });

  it('includes similar colours within the tolerance', () => {
    expect(area(floodFill(rgba, 6, 6, 2, 2, 40))).toBe(4);
  });

  it('does not cross the outline even with a high tolerance', () => {
    const region = floodFill(rgba, 6, 6, 0, 0, 100);
    expect(area(region)).toBe(20);
    expect(region[2 * 6 + 2]).toBe(0);
  });

  it('returns an empty mask for points outside the image', () => {
    expect(area(floodFill(rgba, 6, 6, -1, 2, 10))).toBe(0);
  });
});

describe('compose', () => {
  it('combines base, smart select, and wand additions, minus removals', () => {
    const base = mask(['#...']);
    const sam = mask(['.#..']);
    const added = mask(['..#.']);
    const removed = mask(['.#.#']);
    expect([...compose({ base, sam, added, removed })]).toEqual([1, 0, 1, 0]);
    expect([...compose({ base, sam: null, added, removed: mask(['....']) })]).toEqual([1, 0, 1, 0]);
  });
});

describe('helpers', () => {
  it('measures area and intersection over union', () => {
    const a = mask(['##..']);
    const b = mask(['.##.']);
    expect(area(a)).toBe(2);
    expect(iou(a, b)).toBeCloseTo(1 / 3);
    expect(iou(mask(['....']), mask(['....']))).toBe(1);
  });

  it('adds one mask into another in place', () => {
    const target = mask(['#...']);
    addInto(target, mask(['..#.']));
    expect([...target]).toEqual([1, 0, 1, 0]);
  });

  it('round-trips a mask through black-and-white pixels', () => {
    const m = mask(['#.#.']);
    const rgba = maskToRgba(m);
    expect([...rgba.slice(0, 8)]).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
    expect(rgbaToMask(rgba)).toEqual(m);
  });

  it('colours the working mask and other masks differently', () => {
    const current = mask(['...', '.#.', '...']);
    const others = mask(['#..', '...', '...']);
    const data = overlayPixels(current, others, 3);
    expect(data[3]).toBe(70); // other mask: faint
    expect(data[4 * 4 + 3]).toBe(255); // single-pixel region: all edge
    expect(data[2 * 4 + 3]).toBe(0); // nothing
  });
});

describe('nextInstanceName', () => {
  it('uses the plain object ID for the first instance', () => {
    expect(nextInstanceName('chair', ['stove'])).toEqual({ name: 'chair', rename: null });
  });

  it('renames a single plain instance to @1 when adding a second', () => {
    expect(nextInstanceName('chair', ['chair', 'stove'])).toEqual({
      name: 'chair@2',
      rename: { from: 'chair', to: 'chair@1' },
    });
  });

  it('continues numbering after the highest instance', () => {
    expect(nextInstanceName('chair', ['chair@1', 'chair@3'])).toEqual({
      name: 'chair@4',
      rename: null,
    });
  });

  it('does not confuse objects whose IDs share a prefix', () => {
    expect(nextInstanceName('cup', ['cupboard'])).toEqual({ name: 'cup', rename: null });
  });
});
