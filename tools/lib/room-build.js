/**
 * Pure algorithms behind build:rooms, kept free of file I/O so they can be unit-tested
 * on small synthetic masks.
 */

const MASK_NAME = /^([a-z]+(?:-[a-z]+)*)(?:@([1-9][0-9]*))?$/;

/**
 * @param {string} name mask file name without extension, e.g. "chair@2"
 * @returns {{ objectId: string, name: string } | null}
 */
export function parseMaskName(name) {
  const match = MASK_NAME.exec(name);
  return match ? { objectId: match[1], name } : null;
}

/**
 * @typedef {object} Mask
 * @property {string} name instance name (mask file name)
 * @property {string} objectId
 * @property {Uint8Array} pixels one byte per pixel; non-zero = inside the object
 * @property {number} [depth] higher depth wins overlaps (default 0)
 */

/**
 * @typedef {object} Overlap
 * @property {string} a
 * @property {string} b
 * @property {number} pixels contested pixel count
 * @property {string} winner the mask that owns those pixels
 */

/**
 * Combines masks into one index map: each pixel holds the 1-based index of the mask
 * that owns it, or 0. Where masks overlap, the higher `depth` wins; at equal depth the
 * smaller mask wins (a cup in front of a cabinet). Empty masks are problems; overlaps
 * are reported but resolved.
 * @param {Mask[]} masks
 * @param {number} width
 * @param {number} height
 * @returns {{ index: Uint8Array, overlaps: Overlap[], problems: string[] }}
 */
export function combineMasks(masks, width, height) {
  const problems = [];
  if (masks.length > 255) {
    problems.push(`a room can have at most 255 instances, got ${masks.length}`);
  }

  const areas = masks.map((mask) => {
    let n = 0;
    for (let p = 0; p < width * height; p++) if (mask.pixels[p]) n++;
    return n;
  });
  masks.forEach((mask, i) => {
    if (areas[i] === 0) problems.push(`mask "${mask.name}" is empty`);
  });

  // Paint from lowest to highest priority, so winners are painted last.
  const order = masks
    .map((mask, i) => i)
    .sort(
      (i, j) =>
        (masks[i].depth ?? 0) - (masks[j].depth ?? 0) ||
        areas[j] - areas[i] ||
        masks[j].name.localeCompare(masks[i].name),
    );

  const index = new Uint8Array(width * height);
  /** @type {Map<string, Overlap>} */
  const overlaps = new Map();

  for (const i of order) {
    const mask = masks[i];
    for (let p = 0; p < index.length; p++) {
      if (!mask.pixels[p]) continue;
      const previous = index[p];
      if (previous) {
        const other = masks[previous - 1].name;
        const [a, b] = [other, mask.name].sort();
        const key = `${a}|${b}`;
        const entry = overlaps.get(key) ?? { a, b, pixels: 0, winner: mask.name };
        entry.pixels++;
        entry.winner = mask.name;
        overlaps.set(key, entry);
      }
      index[p] = i + 1;
    }
  }

  return { index, overlaps: [...overlaps.values()], problems };
}

/**
 * Downsamples an index map by an integer factor, keeping the top-left pixel of each block.
 * @param {Uint8Array} index
 * @param {number} width
 * @param {number} height
 * @param {number} factor
 */
export function downsample(index, width, height, factor) {
  const w = Math.floor(width / factor);
  const h = Math.floor(height / factor);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[y * w + x] = index[y * factor * width + x * factor];
    }
  }
  return { pixels: out, width: w, height: h };
}

/**
 * Bounding box of each instance, in the map's pixel coordinates.
 * @param {Uint8Array} index
 * @param {number} width
 * @param {number} count number of instances
 * @returns {({ x: number, y: number, w: number, h: number } | null)[]} per instance (0-based)
 */
export function instanceBounds(index, width, count) {
  const box = Array.from({ length: count }, () => null);
  for (let p = 0; p < index.length; p++) {
    const v = index[p];
    if (!v) continue;
    const x = p % width;
    const y = (p - x) / width;
    const b = box[v - 1];
    if (!b) {
      box[v - 1] = { minX: x, minY: y, maxX: x, maxY: y };
    } else {
      if (x < b.minX) b.minX = x;
      if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y;
      if (y > b.maxY) b.maxY = y;
    }
  }
  return box.map((b) =>
    b ? { x: b.minX, y: b.minY, w: b.maxX - b.minX + 1, h: b.maxY - b.minY + 1 } : null,
  );
}

/**
 * For each instance, the pixel farthest (4-neighbour distance) from the edge of its
 * region, preferring the one nearest the region's centroid: a point safely inside the
 * object, used by tests and highlights.
 * @param {Uint8Array} index
 * @param {number} width
 * @param {number} height
 * @param {number} count number of instances
 * @returns {([number, number] | null)[]} per instance (0-based), in pixel coordinates
 */
export function tapPoints(index, width, height, count) {
  const dist = new Int32Array(index.length);
  const queue = new Int32Array(index.length);
  let head = 0;
  let tail = 0;

  const same = (p, q) => index[q] === index[p];

  // Boundary pixels: inside a region and next to another region or the image edge.
  for (let p = 0; p < index.length; p++) {
    if (!index[p]) continue;
    const x = p % width;
    const y = (p - x) / width;
    const edge =
      x === 0 ||
      y === 0 ||
      x === width - 1 ||
      y === height - 1 ||
      !same(p, p - 1) ||
      !same(p, p + 1) ||
      !same(p, p - width) ||
      !same(p, p + width);
    if (edge) {
      dist[p] = 1;
      queue[tail++] = p;
    }
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const neighbours = [
      x > 0 ? p - 1 : -1,
      x < width - 1 ? p + 1 : -1,
      p - width >= 0 ? p - width : -1,
      p + width < index.length ? p + width : -1,
    ];
    for (const q of neighbours) {
      if (q >= 0 && !dist[q] && same(p, q)) {
        dist[q] = dist[p] + 1;
        queue[tail++] = q;
      }
    }
  }

  // Centroid of each region, to break ties between equally deep pixels.
  const sums = Array.from({ length: count }, () => ({ x: 0, y: 0, n: 0 }));
  for (let p = 0; p < index.length; p++) {
    const v = index[p];
    if (!v) continue;
    const s = sums[v - 1];
    s.x += p % width;
    s.y += Math.floor(p / width);
    s.n++;
  }

  const best = Array.from({ length: count }, () => ({ p: -1, d: 0, c: Infinity }));
  for (let p = 0; p < index.length; p++) {
    const v = index[p];
    if (!v) continue;
    const b = best[v - 1];
    const s = sums[v - 1];
    const dx = (p % width) - s.x / s.n;
    const dy = Math.floor(p / width) - s.y / s.n;
    const c = dx * dx + dy * dy;
    if (dist[p] > b.d || (dist[p] === b.d && c < b.c)) best[v - 1] = { p, d: dist[p], c };
  }
  return best.map(({ p }) => (p < 0 ? null : [p % width, Math.floor(p / width)]));
}

/**
 * Grows hit regions into free (unowned) pixels, never into another region:
 * 1. every region grows by `basePad + extraPad[i]` pixels, so thin parts are easier to hit;
 * 2. regions whose bounding box is still smaller than `minSize` keep growing until they
 *    reach it or run out of free space.
 * Growth is 8-neighbour, one pixel per step; when regions compete for a pixel, the
 * smaller region gets it.
 * @param {Uint8Array} index
 * @param {number} width
 * @param {number} height
 * @param {number} count number of instances
 * @param {{ basePad?: number, minSize?: number, extraPad?: number[] }} [options] in pixels
 * @returns {{ index: Uint8Array, tooSmall: number[] }} padded map and 0-based instances
 *   still below the minimum size
 */
export function padRegions(index, width, height, count, options = {}) {
  const { basePad = 0, minSize = 0, extraPad = [] } = options;
  const out = index.slice();
  const boxes = instanceBounds(out, width, count).map((b) =>
    b ? { minX: b.x, minY: b.y, maxX: b.x + b.w - 1, maxY: b.y + b.h - 1 } : null,
  );
  const areas = new Array(count).fill(0);
  for (let p = 0; p < out.length; p++) if (out[p]) areas[out[p] - 1]++;

  /** Grows each listed region by one pixel; returns the regions that gained pixels. */
  function grow(regions) {
    const snapshot = out.slice();
    const grown = new Set();
    for (const r of [...regions].sort((a, b) => areas[a] - areas[b])) {
      const box = boxes[r];
      const value = r + 1;
      const x0 = Math.max(0, box.minX - 1);
      const x1 = Math.min(width - 1, box.maxX + 1);
      const y0 = Math.max(0, box.minY - 1);
      const y1 = Math.min(height - 1, box.maxY + 1);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const p = y * width + x;
          if (snapshot[p] || out[p]) continue;
          let touches = false;
          for (let dy = -1; dy <= 1 && !touches; dy++) {
            for (let dx = -1; dx <= 1 && !touches; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              touches =
                nx >= 0 &&
                ny >= 0 &&
                nx < width &&
                ny < height &&
                snapshot[ny * width + nx] === value;
            }
          }
          if (!touches) continue;
          out[p] = value;
          areas[r]++;
          grown.add(r);
          if (x < box.minX) box.minX = x;
          if (x > box.maxX) box.maxX = x;
          if (y < box.minY) box.minY = y;
          if (y > box.maxY) box.maxY = y;
        }
      }
    }
    return grown;
  }

  const present = boxes.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
  const target = (i) => basePad + (extraPad[i] ?? 0);
  const steps = Math.max(0, ...present.map(target));
  for (let step = 1; step <= steps; step++) {
    grow(present.filter((i) => target(i) >= step));
  }

  const small = (i) =>
    boxes[i].maxX - boxes[i].minX + 1 < minSize || boxes[i].maxY - boxes[i].minY + 1 < minSize;
  let growing = present.filter(small);
  for (let step = 0; growing.length && step < minSize; step++) {
    const grown = grow(growing);
    growing = growing.filter((i) => grown.has(i) && small(i));
  }

  return { index: out, tooSmall: present.filter(small) };
}

/**
 * Cuts one instance out of the painting: its pixels with an alpha channel taken from the
 * index map, softened by a 3 × 3 box blur (about 1 px of feathering), trimmed to the
 * instance's bounds plus one pixel for the feather.
 * @param {Uint8Array} rgba painting pixels, 4 bytes per pixel
 * @param {Uint8Array} index full-resolution index map
 * @param {number} width
 * @param {number} height
 * @param {number} value 1-based instance index
 * @param {{ x: number, y: number, w: number, h: number }} bounds
 * @returns {{ data: Uint8Array, x: number, y: number, w: number, h: number }}
 */
export function cutout(rgba, index, width, height, value, bounds) {
  const x0 = Math.max(0, bounds.x - 1);
  const y0 = Math.max(0, bounds.y - 1);
  const x1 = Math.min(width, bounds.x + bounds.w + 1);
  const y1 = Math.min(height, bounds.y + bounds.h + 1);
  const w = x1 - x0;
  const h = y1 - y0;
  const data = new Uint8Array(w * h * 4);

  const inside = (x, y) =>
    x >= 0 && y >= 0 && x < width && y < height && index[y * width + x] === value;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x0 + x;
      const sy = y0 + y;
      let covered = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (inside(sx + dx, sy + dy)) covered++;
      }
      const s = (sy * width + sx) * 4;
      const o = (y * w + x) * 4;
      data[o] = rgba[s];
      data[o + 1] = rgba[s + 1];
      data[o + 2] = rgba[s + 2];
      data[o + 3] = Math.round((covered * 255) / 9);
    }
  }
  return { data, x: x0, y: y0, w, h };
}

/**
 * Packs rectangles into pages with a simple shelf algorithm (tallest first).
 * @param {{ name: string, w: number, h: number }[]} items
 * @param {{ pageSize?: number, padding?: number }} [options]
 * @returns {{ pages: { width: number, height: number }[],
 *             placements: Map<string, { page: number, x: number, y: number }> }}
 */
export function packShelves(items, { pageSize = 2048, padding = 2 } = {}) {
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w || a.name.localeCompare(b.name));
  const pages = [];
  const placements = new Map();
  let page = -1;
  let x = 0;
  let y = 0;
  let shelf = 0;

  const newPage = () => {
    pages.push({ width: 0, height: 0 });
    page++;
    x = padding;
    y = padding;
    shelf = 0;
  };

  for (const item of sorted) {
    if (item.w + 2 * padding > pageSize || item.h + 2 * padding > pageSize) {
      throw new Error(`"${item.name}" (${item.w} × ${item.h}) does not fit on a ${pageSize} page`);
    }
    if (page < 0) newPage();
    if (x + item.w + padding > pageSize) {
      x = padding;
      y += shelf + padding;
      shelf = 0;
    }
    if (y + item.h + padding > pageSize) newPage();

    placements.set(item.name, { page, x, y });
    const p = pages[page];
    p.width = Math.max(p.width, x + item.w + padding);
    p.height = Math.max(p.height, y + item.h + padding);
    x += item.w + padding;
    shelf = Math.max(shelf, item.h);
  }
  return { pages, placements };
}

/**
 * Colours every region of an index map for review: a translucent fill per instance with
 * an opaque edge. Returns RGBA pixels the size of the map.
 * @param {Uint8Array} index
 * @param {number} width
 * @param {number} height
 * @param {(value: number) => [number, number, number]} colourOf
 */
export function regionOverlay(index, width, height, colourOf) {
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < index.length; p++) {
    const v = index[p];
    if (!v) continue;
    const x = p % width;
    const y = (p - x) / width;
    const edge =
      x === 0 ||
      y === 0 ||
      x === width - 1 ||
      y === height - 1 ||
      index[p - 1] !== v ||
      index[p + 1] !== v ||
      index[p - width] !== v ||
      index[p + width] !== v;
    const [r, g, b] = colourOf(v);
    data.set([r, g, b, edge ? 255 : 120], p * 4);
  }
  return data;
}
