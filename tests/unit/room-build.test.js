import { describe, expect, it } from 'vitest';
import {
  combineMasks,
  cutout,
  downsample,
  glowHalo,
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

  it('shares overlapping pixels at equal depth, the smallest instance first', () => {
    const stereo = mask('stereo', ['####', '####']);
    const speaker = mask('speaker', ['.#..', '....']);
    const { index, sets, areas, overlaps, problems } = combineMasks([stereo, speaker], 4, 2);
    expect(problems).toEqual([]);
    // Cells 1 and 2 are the instances alone; cell 3 is both, the speaker first.
    expect(sets).toEqual([[], [1], [2], [2, 1]]);
    expect([...index]).toEqual([1, 3, 1, 1, 1, 1, 1, 1]);
    expect(areas).toEqual([8, 1]);
    expect(overlaps).toEqual([{ a: 'speaker', b: 'stereo', pixels: 1, front: null }]);
  });

  it('gives overlapping pixels to the higher depth alone', () => {
    const table = mask('table', ['####', '####']);
    const cup = { ...mask('cup', ['.#..', '....']), depth: 1 };
    const { index, sets, overlaps } = combineMasks([table, cup], 4, 2);
    expect(sets).toEqual([[], [1], [2]]);
    expect([...index]).toEqual([1, 2, 1, 1, 1, 1, 1, 1]);
    expect(overlaps).toEqual([{ a: 'cup', b: 'table', pixels: 1, front: 'cup' }]);
  });

  it('shares a three-way overlap among all three masks', () => {
    const big = mask('big', ['#####']);
    const medium = mask('medium', ['.###.']);
    const small = mask('small', ['..#..']);
    const { index, sets, overlaps } = combineMasks([big, medium, small], 5, 1);
    expect([...index].map((cell) => sets[cell])).toEqual([[1], [2, 1], [3, 2, 1], [2, 1], [1]]);
    const byPair = Object.fromEntries(overlaps.map((o) => [`${o.a}|${o.b}`, o]));
    expect(byPair['big|medium']).toMatchObject({ pixels: 3, front: null });
    expect(byPair['medium|small']).toMatchObject({ pixels: 1, front: null });
    expect(byPair['big|small']).toMatchObject({ pixels: 1, front: null });
  });

  it('does not count masks that are both hidden behind a third', () => {
    const wall = mask('wall', ['###']);
    const shelf = mask('shelf', ['.##']);
    const clock = { ...mask('clock', ['..#']), depth: 1 };
    const { index, sets, overlaps } = combineMasks([wall, shelf, clock], 3, 1);
    expect([...index].map((cell) => sets[cell])).toEqual([[1], [2, 1], [3]]);
    const byPair = Object.fromEntries(overlaps.map((o) => [`${o.a}|${o.b}`, o]));
    expect(byPair['shelf|wall'].pixels).toBe(1);
    expect(byPair['clock|wall']).toMatchObject({ pixels: 1, front: 'clock' });
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
    const { index, sets } = combineMasks([mask('a', ['####']), mask('b', ['.##.'])], 4, 1);
    // b is inside a, so it cannot grow.
    const { tooSmall } = padRegions(index, 4, 1, 2, { minSize: 3, sets });
    expect(tooSmall).toEqual([0, 1]);
  });

  it('grows a whole around its shared parts, keeping the shared pixels', () => {
    const { index, sets } = combineMasks(
      [mask('stereo', ['.....', '.###.', '.....']), mask('speaker', ['.....', '.#...', '.....'])],
      5,
      3,
    );
    const padded = padRegions(index, 5, 3, 2, { basePad: 1, sets });
    const shared = sets.findIndex((set) => set.length === 2);
    // The speaker grows into the free pixels next to it first (it is smaller), and the
    // shared pixel stays shared.
    expect(padded.index[1 * 5 + 1]).toBe(shared);
    expect(padded.index[1 * 5 + 0]).toBe(2);
    expect(padded.index[1 * 5 + 4]).toBe(1);
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

describe('cutout and glowHalo with shared pixels', () => {
  const { index, sets } = combineMasks(
    [mask('stereo', ['.....', '.###.', '.....']), mask('speaker', ['.....', '.#...', '.....'])],
    5,
    3,
  );
  const white = new Uint8Array(5 * 3 * 4).fill(255);

  it("cuts the whole's full mask, its shared parts included", () => {
    const piece = cutout(white, index, 5, 3, 1, { x: 1, y: 1, w: 3, h: 1 }, sets);
    const alpha = (x, y) => piece.data[((y - piece.y) * piece.w + (x - piece.x)) * 4 + 3];
    // The shared pixel (the speaker) has the same feathered alpha as the stereo's
    // other end: it is part of the stereo's cut-out.
    expect(alpha(1, 1)).toBe(alpha(3, 1));
    expect(alpha(1, 1)).toBeGreaterThan(0);
  });

  it("glows over the whole's full mask", () => {
    const halo = glowHalo(index, 5, 3, 1, { x: 1, y: 1, w: 3, h: 1 }, 2, sets);
    const alpha = (x, y) => halo.data[((y - halo.y) * halo.w + (x - halo.x)) * 4 + 3];
    expect(alpha(1, 1)).toBe(255);
    expect(alpha(3, 1)).toBe(255);
  });
});

describe('glowHalo', () => {
  // A 3 × 3 square in the middle of a 20 × 20 map.
  const width = 20;
  const index = new Uint8Array(width * width);
  for (let y = 9; y <= 11; y++) for (let x = 9; x <= 11; x++) index[y * width + x] = 1;
  const halo = glowHalo(index, width, width, 1, { x: 9, y: 9, w: 3, h: 3 }, 4);
  const alpha = (x, y) => halo.data[((y - halo.y) * halo.w + (x - halo.x)) * 4 + 3];

  it('covers the instance plus the radius on every side', () => {
    expect(halo).toMatchObject({ x: 5, y: 5, w: 11, h: 11 });
  });

  it('is opaque over the instance and fades with distance', () => {
    expect(alpha(10, 10)).toBe(255);
    expect(alpha(12, 10)).toBe(Math.round(255 * 0.75 ** 1.5));
    expect(alpha(13, 10)).toBe(Math.round(255 * 0.5 ** 1.5));
    expect(alpha(15, 10)).toBe(0);
    expect(alpha(12, 10)).toBeGreaterThan(alpha(13, 10));
  });

  it('uses near-Euclidean distance at the corners', () => {
    // One pixel diagonally from the corner: distance √2, not 2.
    expect(alpha(12, 12)).toBe(Math.round(255 * (1 - Math.SQRT2 / 4) ** 1.5));
  });

  it('is white and clipped to the map', () => {
    const edge = glowHalo(index, width, width, 1, { x: 9, y: 9, w: 3, h: 3 }, 12);
    expect(edge).toMatchObject({ x: 0, y: 0, w: 20, h: 20 });
    expect([...edge.data.slice(0, 3)]).toEqual([255, 255, 255]);
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

  it('stripes shared pixels in the colours of every instance there', () => {
    const index = new Uint16Array(20).fill(3);
    const sets = [[], [1], [2], [2, 1]];
    const colours = { 1: [255, 0, 0], 2: [0, 0, 255] };
    const data = regionOverlay(index, 20, 1, (v) => colours[v], sets);
    const rgb = (x) => [...data.slice(x * 4, x * 4 + 3)];
    expect(rgb(0)).toEqual([0, 0, 255]);
    expect(rgb(6)).toEqual([255, 0, 0]);
    expect(rgb(12)).toEqual([0, 0, 255]);
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
  it('includes shared pixels in the box of every instance there', () => {
    const { index, sets } = combineMasks(
      [mask('stereo', ['####.']), mask('speaker', ['...##'])],
      5,
      1,
    );
    expect(instanceBounds(index, 5, 2, sets)).toEqual([
      { x: 0, y: 0, w: 4, h: 1 },
      { x: 3, y: 0, w: 2, h: 1 },
    ]);
  });

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

  it('puts each tap point where its instance is the most specific', () => {
    const { index, sets } = combineMasks(
      [
        mask('stereo', ['.........', '.#######.', '.#######.', '.#######.', '.........']),
        mask('speaker', ['.........', '.###.....', '.###.....', '.###.....', '.........']),
      ],
      9,
      5,
    );
    const [stereo, speaker] = tapPoints(index, 9, 5, 2, sets);
    // The stereo's point is on its own part, not on the speaker it shares.
    expect(sets[index[stereo[1] * 9 + stereo[0]]]).toEqual([1]);
    expect(sets[index[speaker[1] * 9 + speaker[0]]][0]).toBe(2);
  });

  it('falls back to the whole region of an instance made only of parts', () => {
    const { index, sets } = combineMasks(
      [mask('pair', ['####']), mask('left', ['##..']), mask('right', ['..##'])],
      4,
      1,
    );
    const [pair] = tapPoints(index, 4, 1, 3, sets);
    expect(sets[index[pair[0]]]).toContain(1);
  });

  it('returns null for instances with no pixels', () => {
    expect(tapPoints(new Uint8Array(4), 2, 2, 1)).toEqual([null]);
  });
});
