/**
 * Draws an instance's hit region as an image: a translucent fill with a solid edge.
 * Used for feedback highlights and the debug overlay. Region pixels come from the hit
 * map (half resolution), so the image is displayed at twice its size.
 */

/**
 * @param {import('../core/hitmap.js').HitmapGrid} hitmap
 * @param {{ index: number, bounds: { x: number, y: number, w: number, h: number } }} instance
 * @param {[number, number, number]} rgb
 * @param {{ fill?: number, edge?: number }} [alpha] 0–255
 * @returns {{ canvas: HTMLCanvasElement, x: number, y: number, scale: number }}
 */
export function regionCanvas(hitmap, instance, rgb, { fill = 110, edge = 255 } = {}) {
  const scale = 2;
  const x0 = Math.floor(instance.bounds.x / scale);
  const y0 = Math.floor(instance.bounds.y / scale);
  const w = Math.ceil(instance.bounds.w / scale) + 1;
  const h = Math.ceil(instance.bounds.h / scale) + 1;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(w, h);

  const at = (x, y) =>
    x >= 0 && y >= 0 && x < hitmap.width && y < hitmap.height
      ? hitmap.pixels[y * hitmap.width + x]
      : 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hx = x0 + x;
      const hy = y0 + y;
      if (at(hx, hy) !== instance.index) continue;
      const isEdge =
        at(hx - 1, hy) !== instance.index ||
        at(hx + 1, hy) !== instance.index ||
        at(hx, hy - 1) !== instance.index ||
        at(hx, hy + 1) !== instance.index;
      const o = (y * w + x) * 4;
      image.data[o] = rgb[0];
      image.data[o + 1] = rgb[1];
      image.data[o + 2] = rgb[2];
      image.data[o + 3] = isEdge ? edge : fill;
    }
  }
  ctx.putImageData(image, 0, 0);
  return { canvas, x: x0 * scale, y: y0 * scale, scale };
}
