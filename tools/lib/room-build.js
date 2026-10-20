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
 */

/**
 * Combines masks into one index map: each pixel holds the 1-based index of the mask
 * that covers it, or 0. Every overlap and empty mask is reported.
 * @param {Mask[]} masks
 * @param {number} width
 * @param {number} height
 * @returns {{ index: Uint8Array, problems: string[] }}
 */
export function combineMasks(masks, width, height) {
  const problems = [];
  if (masks.length > 255)
    problems.push(`a room can have at most 255 instances, got ${masks.length}`);

  const index = new Uint8Array(width * height);
  /** @type {Map<string, number>} "a|b" → overlapping pixel count */
  const overlaps = new Map();

  masks.forEach((mask, i) => {
    let covered = 0;
    for (let p = 0; p < index.length; p++) {
      if (!mask.pixels[p]) continue;
      covered++;
      if (index[p]) {
        const key = `${masks[index[p] - 1].name}|${mask.name}`;
        overlaps.set(key, (overlaps.get(key) ?? 0) + 1);
      } else {
        index[p] = i + 1;
      }
    }
    if (covered === 0) problems.push(`mask "${mask.name}" is empty`);
  });

  for (const [key, count] of overlaps) {
    const [a, b] = key.split('|');
    problems.push(`masks "${a}" and "${b}" overlap on ${count} pixels`);
  }
  return { index, problems };
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
