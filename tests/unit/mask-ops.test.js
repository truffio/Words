import { describe, expect, it } from 'vitest';
import {
  addInto,
  area,
  compose,
  fillPolygon,
  floodFill,
  iou,
  masksAt,
  masksOverlay,
  maskToRgba,
  nextInstanceName,
  overlayPixels,
  rectangleCorners,
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

  it('draws the working mask over the layer underneath', () => {
    const current = mask(['...', '.#.', '...']);
    const under = new Uint8ClampedArray(9 * 4);
    under.set([1, 2, 3, 70], 0);
    const data = overlayPixels(current, 3, under);
    expect([...data.slice(0, 4)]).toEqual([1, 2, 3, 70]); // the layer underneath
    expect(data[4 * 4 + 3]).toBe(255); // single-pixel region: all edge
    expect(data[2 * 4 + 3]).toBe(0); // nothing
    expect(overlayPixels(current, 3)[3]).toBe(0); // no layer underneath
  });
});

describe('masksOverlay', () => {
  it('colours each mask, with an opaque edge and stripes where masks overlap', () => {
    const rows = (row) => mask([row, row, row]);
    const red = { pixels: rows('#'.repeat(30)), colour: [255, 0, 0] };
    const blue = { pixels: rows('.'.repeat(12) + '#'.repeat(18)), colour: [0, 0, 255] };
    const data = masksOverlay([red, blue], 30, 90);
    // Pixels of the middle row.
    const px = (x) => [...data.slice((30 + x) * 4, (30 + x) * 4 + 4)];
    expect(px(0)).toEqual([255, 0, 0, 255]); // red alone, at the image edge
    expect(px(5)).toEqual([255, 0, 0, 110]); // red alone, inside
    // From x = 12 both masks are there: stripes of 12 pixels alternate the colours.
    expect(px(15).slice(0, 3)).toEqual([0, 0, 255]);
    expect(px(23).slice(0, 3)).toEqual([255, 0, 0]);
  });

  it('leaves pixels outside every mask clear', () => {
    const data = masksOverlay([{ pixels: mask(['#..']), colour: [9, 9, 9] }], 3, 3);
    expect(data[1 * 4 + 3]).toBe(0);
  });
});

describe('fillPolygon', () => {
  it('fills a rectangle between two corner pixels, both included', () => {
    const filled = fillPolygon(rectangleCorners({ x: 3, y: 2 }, { x: 1, y: 1 }), 5, 4);
    expect(toRows(filled, 5)).toEqual(['.....', '.###.', '.###.', '.....']);
  });

  it('fills a triangle by pixel centres', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 0, y: 6 },
    ];
    expect(toRows(fillPolygon(triangle, 6, 6), 6)).toEqual([
      '#####.',
      '####..',
      '###...',
      '##....',
      '#.....',
      '......',
    ]);
  });

  it('leaves the hole of a self-crossing outline empty (even-odd)', () => {
    // A square drawn twice around: outer, then inner in the same path.
    const ring = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 6 },
      { x: 0, y: 6 },
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
    ];
    const rows = toRows(fillPolygon(ring, 6, 6), 6);
    expect(rows[0]).toBe('######');
    expect(rows[2]).toBe('##..##');
  });

  it('clips to the image and needs at least three points', () => {
    const big = rectangleCorners({ x: -5, y: -5 }, { x: 10, y: 10 });
    expect(area(fillPolygon(big, 4, 3))).toBe(12);
    expect(area(fillPolygon(big.slice(0, 2), 4, 3))).toBe(0);
  });
});

describe('masksAt', () => {
  const stereo = { name: 'stereo-system', pixels: mask(['###']), depth: 0, area: 3 };
  const speaker = { name: 'speaker', pixels: mask(['.##']), depth: 0, area: 2 };
  const clock = { name: 'clock', pixels: mask(['..#']), depth: 1, area: 1 };

  it('lists every mask at the pixel, the most specific first', () => {
    expect(masksAt([stereo, speaker], 1)).toEqual(['speaker', 'stereo-system']);
    expect(masksAt([stereo, speaker], 0)).toEqual(['stereo-system']);
  });

  it('keeps only the masks with the highest depth', () => {
    expect(masksAt([stereo, speaker, clock], 2)).toEqual(['clock']);
  });

  it('finds nothing where there is no mask', () => {
    expect(masksAt([speaker], 0)).toEqual([]);
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
