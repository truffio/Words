import { describe, expect, it } from 'vitest';
import {
  combineMasks,
  downsample,
  instanceBounds,
  parseMaskName,
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

  it('reports overlapping and empty masks', () => {
    const a = mask('a', ['###.', '....']);
    const b = mask('b', ['.##.', '....']);
    const c = mask('c', ['....', '....']);
    const { problems } = combineMasks([a, b, c], 4, 2);
    expect(problems).toContain('masks "a" and "b" overlap on 2 pixels');
    expect(problems).toContain('mask "c" is empty');
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
