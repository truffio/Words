/**
 * Pure mask operations for the mask tool, free of DOM and model code so they can be
 * unit-tested in Node. A mask is a Uint8Array with one byte per pixel (1 = inside).
 */

/**
 * Magic wand: the 4-connected region around (x, y) whose colours are within
 * `tolerance` (Euclidean RGB distance) of the colour at (x, y). Dark outlines in
 * cartoon art stop the fill.
 * @param {Uint8ClampedArray | Uint8Array} rgba painting pixels, 4 bytes per pixel
 * @param {number} width
 * @param {number} height
 * @param {number} x
 * @param {number} y
 * @param {number} tolerance 0–441
 * @returns {Uint8Array}
 */
export function floodFill(rgba, width, height, x, y, tolerance) {
  const mask = new Uint8Array(width * height);
  if (x < 0 || y < 0 || x >= width || y >= height) return mask;
  const start = (y * width + x) * 4;
  const [r0, g0, b0] = [rgba[start], rgba[start + 1], rgba[start + 2]];
  const limit = tolerance * tolerance;
  const similar = (p) => {
    const o = p * 4;
    const dr = rgba[o] - r0;
    const dg = rgba[o + 1] - g0;
    const db = rgba[o + 2] - b0;
    return dr * dr + dg * dg + db * db <= limit;
  };

  const stack = new Int32Array(width * height);
  let top = 0;
  stack[top++] = y * width + x;
  mask[y * width + x] = 1;
  while (top > 0) {
    const p = stack[--top];
    const px = p % width;
    const neighbours = [
      px > 0 ? p - 1 : -1,
      px < width - 1 ? p + 1 : -1,
      p >= width ? p - width : -1,
      p + width < width * height ? p + width : -1,
    ];
    for (const q of neighbours) {
      if (q >= 0 && !mask[q] && similar(q)) {
        mask[q] = 1;
        stack[top++] = q;
      }
    }
  }
  return mask;
}

/**
 * The working mask: (base ∪ sam ∪ added) minus removed.
 * @param {{ base: Uint8Array, sam: Uint8Array | null, added: Uint8Array, removed: Uint8Array }} layers
 */
export function compose({ base, sam, added, removed }) {
  const out = new Uint8Array(base.length);
  for (let p = 0; p < out.length; p++) {
    out[p] = (base[p] || (sam && sam[p]) || added[p]) && !removed[p] ? 1 : 0;
  }
  return out;
}

/** Sets every pixel of `region` in `target` (in place). */
export function addInto(target, region) {
  for (let p = 0; p < target.length; p++) if (region[p]) target[p] = 1;
  return target;
}

/** Number of pixels inside a mask. */
export function area(mask) {
  let n = 0;
  for (let p = 0; p < mask.length; p++) if (mask[p]) n++;
  return n;
}

/** Intersection over union of two masks (0–1), or 1 when both are empty. */
export function iou(a, b) {
  let inter = 0;
  let union = 0;
  for (let p = 0; p < a.length; p++) {
    if (a[p] && b[p]) inter++;
    if (a[p] || b[p]) union++;
  }
  return union ? inter / union : 1;
}

/**
 * Overlay pixels for display: the working mask in translucent green with an opaque edge,
 * over an optional background layer (e.g. the saved masks, from `masksOverlay`).
 * @param {Uint8Array} current
 * @param {number} width
 * @param {Uint8ClampedArray | null} [under] RGBA pixels shown where the mask is not
 * @returns {Uint8ClampedArray}
 */
export function overlayPixels(current, width, under = null) {
  const data = under ? under.slice() : new Uint8ClampedArray(current.length * 4);
  for (let p = 0; p < current.length; p++) {
    if (!current[p]) continue;
    const x = p % width;
    const edge =
      x === 0 ||
      x === width - 1 ||
      !current[p - 1] ||
      !current[p + 1] ||
      !current[p - width] ||
      !current[p + width];
    data.set(edge ? [0, 140, 40, 255] : [40, 220, 90, 110], p * 4);
  }
  return data;
}

/** Width of the stripes that show overlapping masks (pixels). */
const STRIPE = 12;

/**
 * Colours several masks for review: a translucent fill per mask with an opaque edge;
 * where masks overlap, stripes in the colours of every mask there.
 * @param {{ pixels: Uint8Array, colour: [number, number, number] }[]} masks
 * @param {number} width
 * @param {number} length pixel count
 * @returns {Uint8ClampedArray} RGBA pixels
 */
export function masksOverlay(masks, width, length) {
  const data = new Uint8ClampedArray(length * 4);
  const here = [];
  for (let p = 0; p < length; p++) {
    here.length = 0;
    for (const mask of masks) if (mask.pixels[p]) here.push(mask);
    if (!here.length) continue;
    const x = p % width;
    const y = (p - x) / width;
    const mask = here[Math.floor((x + y) / STRIPE) % here.length];
    const inside = (q) => q >= 0 && q < length && mask.pixels[q];
    const edge =
      x === 0 ||
      x === width - 1 ||
      !inside(p - 1) ||
      !inside(p + 1) ||
      !inside(p - width) ||
      !inside(p + width);
    data.set([...mask.colour, edge ? 255 : 110], p * 4);
  }
  return data;
}

/**
 * Fills a polygon (even-odd rule): a pixel is inside when its centre is. Used for the
 * rectangle, points, and free-curve tools.
 * @param {{ x: number, y: number }[]} points vertices in pixel coordinates
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
export function fillPolygon(points, width, height) {
  const mask = new Uint8Array(width * height);
  if (points.length < 3) return mask;
  const ys = points.map((p) => p.y);
  const top = Math.max(0, Math.floor(Math.min(...ys)));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  const crossings = [];
  for (let y = top; y <= bottom; y++) {
    const cy = y + 0.5;
    crossings.length = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      // Half-open on y, so a vertex on the scanline is counted once.
      if (a.y <= cy !== b.y <= cy) crossings.push(a.x + ((cy - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    crossings.sort((m, n) => m - n);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const from = Math.max(0, Math.ceil(crossings[k] - 0.5));
      const to = Math.min(width - 1, Math.ceil(crossings[k + 1] - 0.5) - 1);
      mask.fill(1, y * width + from, y * width + to + 1);
    }
  }
  return mask;
}

/**
 * The corners of the rectangle between two opposite corner pixels, both included.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @returns {{ x: number, y: number }[]}
 */
export function rectangleCorners(a, b) {
  const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x) + 1];
  const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y) + 1];
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/**
 * The masks a tap at one pixel detects, by the game's rules (build:rooms): overlapping
 * masks share the pixel, except that only those with the highest depth keep it. The
 * most specific (smallest) mask comes first, as in the game's hit map.
 * @param {{ name: string, pixels: Uint8Array, depth: number, area: number }[]} masks
 * @param {number} p pixel index
 * @returns {string[]} mask names
 */
export function masksAt(masks, p) {
  const here = masks.filter((m) => m.pixels[p]);
  const top = Math.max(...here.map((m) => m.depth));
  return here
    .filter((m) => m.depth === top)
    .sort((a, b) => a.area - b.area || a.name.localeCompare(b.name))
    .map((m) => m.name);
}

/** Black-and-white opaque RGBA pixels for saving a mask as PNG. */
export function maskToRgba(mask) {
  const data = new Uint8ClampedArray(mask.length * 4);
  for (let p = 0; p < mask.length; p++) {
    const v = mask[p] ? 255 : 0;
    data.set([v, v, v, 255], p * 4);
  }
  return data;
}

/** Reads a mask from RGBA pixels: inside where the red channel is at least 128. */
export function rgbaToMask(rgba) {
  const mask = new Uint8Array(rgba.length / 4);
  for (let p = 0; p < mask.length; p++) mask[p] = rgba[p * 4] >= 128 ? 1 : 0;
  return mask;
}

/**
 * Name for a new instance of an object, following the mask naming convention:
 * `<objectId>` for the first, `<objectId>@<n>` for more. When a second instance is added,
 * the existing plain `<objectId>` mask must be renamed to `<objectId>@1`.
 * @param {string} objectId
 * @param {string[]} existing names of the room's existing masks
 * @returns {{ name: string, rename: { from: string, to: string } | null }}
 */
export function nextInstanceName(objectId, existing) {
  const mine = existing.filter((n) => n === objectId || n.startsWith(`${objectId}@`));
  if (mine.length === 0) return { name: objectId, rename: null };
  const numbers = mine.map((n) => (n === objectId ? 1 : Number(n.split('@')[1])));
  const next = Math.max(...numbers) + 1;
  const rename = mine.includes(objectId) ? { from: objectId, to: `${objectId}@1` } : null;
  return { name: `${objectId}@${next}`, rename };
}
