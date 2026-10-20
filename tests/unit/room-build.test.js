import { describe, expect, it } from 'vitest';
import {
  combineMasks,
  cutout,
  downsample,
  instanceBounds,
  packShelves,
  padRegions,
  parseMaskName,
  regionOverlay,
  tapPoints,
} from '../../tools/lib/room-build.js';

/** Builds a mask from rows of '.' (outside) and '#' (inside). */
function mask(name, rows) {
  const pixels = Uint8Array.from(rows.join('').split(''), (c) => (c === '#' ? 1 : 0));
  return { name, objectId: name.split('@')[0], pixels };
}

describe('parseMaskName', () => {
  it('reads the object ID and instance name', () => {
    expect(parseMaskName('stove')).toEqual({ objectId: 'stove', name: 'stove' });
    expect(parseMaskName('chair@2')).toEqual({ objectId: 'chair', name: 'chair@2' });
    expect(parseMaskName('coffee-table@10')).toEqual({
      objectId: 'coffee-table',
      name: 'coffee-table@10',
    });
  });

  it('rejects names that do not follow the convention', () => {
    for (const bad of ['Stove', 'chair@0', 'chair@', 'chair 2', 'coffee_table', '-cup']) {
      expect(parseMaskName(bad)).toBeNull();
    }
  });
});

describe('combineMasks', () => {
  it('assigns each pixel the 1-based index of its mask', () => {
    const a = mask('a', ['##..', '....']);
    const b = mask('b', ['....', '..##']);
    const { index, problems } = combineMasks([a, b], 4, 2);
    expect(problems).toEqual([]);
    expect([...index]).toEqual([1, 1, 0, 0, 0, 0, 2, 2]);
  });

  it('reports empty masks as problems', () => {
    const { problems } = combineMasks([mask('a', ['#.']), mask('b', ['..'])], 2, 1);
    expect(problems).toEqual(['mask "b" is empty']);
  });

  it('gives overlapping pixels to the smaller mask by default', () => {
    const cabinet = mask('cabinet', ['####', '####']);
    const cup = mask('cup', ['.#..', '....']);
    const { index, overlaps, problems } = combineMasks([cabinet, cup], 4, 2);
    expect(problems).toEqual([]);
    expect([...index]).toEqual([1, 2, 1, 1, 1, 1, 1, 1]);
    expect(overlaps).toEqual([{ a: 'cabinet', b: 'cup', pixels: 1, winner: 'cup' }]);
  });

  it('lets a higher depth win over a smaller mask', () => {
    const table = { ...mask('table', ['####', '####']), depth: 1 };
    const cup = mask('cup', ['.#..', '....']);
    const { index, overlaps } = combineMasks([table, cup], 4, 2);
    expect([...index]).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(overlaps[0].winner).toBe('table');
  });

  it('resolves a three-way overlap by size', () => {
    const big = mask('big', ['#####']);
    const medium = mask('medium', ['.###.']);
    const small = mask('small', ['..#..']);
    const { index, overlaps } = combineMasks([big, medium, small], 5, 1);
    expect([...index]).toEqual([1, 2, 3, 2, 1]);
    const byPair = Object.fromEntries(overlaps.map((o) => [`${o.a}|${o.b}`, o]));
    expect(byPair['big|medium']).toMatchObject({ pixels: 3, winner: 'medium' });
    expect(byPair['medium|small']).toMatchObject({ pixels: 1, winner: 'small' });
  });
});

describe('padRegions', () => {
  const rows = (index, width) =>
    Array.from({ length: index.length / width }, (_, y) =>
      [...index.slice(y * width, (y + 1) * width)].join(''),
    );

  it('grows every region by the base padding into free pixels', () => {
    const { index } = combineMasks(
      [mask('a', ['.....', '.....', '..#..', '.....', '.....'])],
      5,
      5,
    );
    const padded = padRegions(index, 5, 5, 1, { basePad: 1 });
    expect(rows(padded.index, 5)).toEqual(['00000', '01110', '01110', '01110', '00000']);
  });

  it('grows a small isolated region up to the minimum size', () => {
    const { index } = combineMasks(
      [mask('a', ['.......', '.......', '...#...', '.......', '.......'])],
      7,
      5,
    );
    const { index: out, tooSmall } = padRegions(index, 7, 5, 1, { minSize: 5 });
    expect(tooSmall).toEqual([]);
    expect(rows(out, 7)).toEqual(['0111110', '0111110', '0111110', '0111110', '0111110']);
  });

  it('never grows into another region', () => {
    const { index } = combineMasks([mask('a', ['###....']), mask('b', ['...#...'])], 7, 1);
    const { index: out } = padRegions(index, 7, 1, 2, { basePad: 2 });
    expect(rows(out, 7)).toEqual(['1112220']);
  });

  it('reports regions that cannot reach the minimum size', () => {
    const { index } = combineMasks([mask('a', ['####']), mask('b', ['.##.'])], 4, 1);
    // b is surrounded by a, so it cannot grow.
    const { tooSmall } = padRegions(index, 4, 1, 2, { minSize: 3 });
    expect(tooSmall).toEqual([0, 1]);
  });

  it('thickens thin parts and applies extra padding per region', () => {
    const { index } = combineMasks(
      [
        mask('leg', ['.......', '...#...', '...#...', '...#...', '.......']),
        mask('dot', ['......#', '.......', '.......', '.......', '.......']),
      ],
      7,
      5,
    );
    const { index: out } = padRegions(index, 7, 5, 2, { basePad: 0, extraPad: [1, 0] });
    expect(rows(out, 7)).toEqual(['0011102', '0011100', '0011100', '0011100', '0011100']);
  });
});

describe('cutout', () => {
  // 4 × 3 painting where each pixel's red channel is its position.
  const width = 4;
  const height = 3;
  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) rgba.set([p, 100, 200, 255], p * 4);

  it('copies the painting and trims to the bounds plus a 1 px feather margin', () => {
    const index = Uint8Array.from([0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0]);
    const piece = cutout(rgba, index, width, height, 1, { x: 1, y: 1, w: 2, h: 1 });
    expect(piece).toMatchObject({ x: 0, y: 0, w: 4, h: 3 });
    // Colours come from the painting at the same position.
    const at = (x, y) => [...piece.data.slice((y * piece.w + x) * 4, (y * piece.w + x) * 4 + 4)];
    expect(at(1, 1).slice(0, 3)).toEqual([5, 100, 200]);
    expect(at(3, 2).slice(0, 3)).toEqual([11, 100, 200]);
  });

  it('feathers the alpha: opaque inside, soft at the edge, clear far outside', () => {
    const index = new Uint8Array(7 * 7);
    for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) index[y * 7 + x] = 1;
    const big = new Uint8Array(7 * 7 * 4).fill(255);
    const piece = cutout(big, index, 7, 7, 1, { x: 1, y: 1, w: 5, h: 5 });
    const alpha = (x, y) => piece.data[(y * piece.w + x) * 4 + 3];
    expect(alpha(3, 3)).toBe(255);
    expect(alpha(1, 3)).toBe(Math.round((6 * 255) / 9));
    expect(alpha(0, 3)).toBe(Math.round((3 * 255) / 9));
    expect(alpha(0, 0)).toBe(Math.round((1 * 255) / 9));
  });
});

describe('packShelves', () => {
  it('places items without overlap, tallest first, within the page', () => {
    const items = [
      { name: 'a', w: 50, h: 20 },
      { name: 'b', w: 30, h: 40 },
      { name: 'c', w: 60, h: 10 },
      { name: 'd', w: 40, h: 40 },
    ];
    const { pages, placements } = packShelves(items, { pageSize: 100, padding: 2 });
    expect(pages).toHaveLength(1);
    const rects = items.map((i) => ({ ...i, ...placements.get(i.name) }));
    for (const r of rects) {
      expect(r.x + r.w).toBeLessThanOrEqual(pages[0].width);
      expect(r.y + r.h).toBeLessThanOrEqual(pages[0].height);
      expect(pages[0].width).toBeLessThanOrEqual(100);
    }
    for (const r of rects) {
      for (const s of rects) {
        if (r === s) continue;
        const apart = r.x + r.w <= s.x || s.x + s.w <= r.x || r.y + r.h <= s.y || s.y + s.h <= r.y;
        expect(apart).toBe(true);
      }
    }
    // Tallest first; among equal heights, the wider item first.
    expect(placements.get('d')).toEqual({ page: 0, x: 2, y: 2 });
    expect(placements.get('b')).toEqual({ page: 0, x: 44, y: 2 });
  });

  it('opens a new page when one is full', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ name: `i${i}`, w: 45, h: 45 }));
    const { pages, placements } = packShelves(items, { pageSize: 100, padding: 2 });
    expect(pages).toHaveLength(2);
    expect(placements.get('i4').page).toBe(1);
  });

  it('rejects an item larger than a page', () => {
    expect(() => packShelves([{ name: 'rug', w: 2048, h: 10 }])).toThrow(/does not fit/);
  });
});

describe('regionOverlay', () => {
  it('colours regions with a translucent fill and an opaque edge', () => {
    const index = new Uint8Array(5 * 5);
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) index[y * 5 + x] = 2;
    const data = regionOverlay(index, 5, 5, () => [10, 20, 30]);
    const px = (x, y) => [...data.slice((y * 5 + x) * 4, (y * 5 + x) * 4 + 4)];
    expect(px(0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(1, 1)).toEqual([10, 20, 30, 255]);
    expect(px(2, 2)).toEqual([10, 20, 30, 120]);
  });
});

describe('downsample', () => {
  it('keeps the top-left pixel of each block', () => {
    const index = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(downsample(index, 4, 4, 2)).toEqual({
      pixels: Uint8Array.from([1, 3, 9, 11]),
      width: 2,
      height: 2,
    });
  });
});

describe('instanceBounds', () => {
  it('returns each instance bounding box', () => {
    const { index } = combineMasks(
      [mask('a', ['.##..', '.#...', '.....']), mask('b', ['.....', '.....', '...##'])],
      5,
      3,
    );
    expect(instanceBounds(index, 5, 3)).toEqual([
      { x: 1, y: 0, w: 2, h: 2 },
      { x: 3, y: 2, w: 2, h: 1 },
      null,
    ]);
  });
});

describe('tapPoints', () => {
  it('picks the point farthest from the region edge', () => {
    const { index } = combineMasks(
      [mask('a', ['.......', '.#####.', '.#####.', '.#####.', '.......'])],
      7,
      5,
    );
    expect(tapPoints(index, 7, 5, 1)).toEqual([[3, 2]]);
  });

  it('keeps the point inside an L-shaped region', () => {
    const rows = ['###.....', '###.....', '###.....', '########', '########', '########'];
    const { index } = combineMasks([mask('a', rows)], 8, 6);
    const [[x, y]] = tapPoints(index, 8, 6, 1);
    // Inside the region and not on its edge: all four neighbours belong to it too.
    for (const [nx, ny] of [
      [x, y],
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      expect(index[ny * 8 + nx]).toBe(1);
    }
  });

  it('treats neighbouring regions as edges', () => {
    const { index } = combineMasks(
      [mask('a', ['###', '#.#', '###']), mask('b', ['...', '.#.', '...'])],
      3,
      3,
    );
    const [a, b] = tapPoints(index, 3, 3, 2);
    expect(b).toEqual([1, 1]);
    expect(index[a[1] * 3 + a[0]]).toBe(1);
  });

  it('returns null for instances with no pixels', () => {
    expect(tapPoints(new Uint8Array(4), 2, 2, 1)).toEqual([null]);
  });
});
