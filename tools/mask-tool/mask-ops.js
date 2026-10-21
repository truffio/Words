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
 * Overlay pixels for display: other objects' masks in a faint blue, the working mask in
 * translucent green with an opaque edge.
 * @param {Uint8Array} current
 * @param {Uint8Array} others
 * @param {number} width
 * @returns {Uint8ClampedArray}
 */
export function overlayPixels(current, others, width) {
  const data = new Uint8ClampedArray(current.length * 4);
  for (let p = 0; p < current.length; p++) {
    const o = p * 4;
    if (current[p]) {
      const x = p % width;
      const edge =
        x === 0 ||
        x === width - 1 ||
        !current[p - 1] ||
        !current[p + 1] ||
        !current[p - width] ||
        !current[p + width];
      data.set(edge ? [0, 140, 40, 255] : [40, 220, 90, 110], o);
    } else if (others[p]) {
      data.set([40, 110, 255, 70], o);
    }
  }
  return data;
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
