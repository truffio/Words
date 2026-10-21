/**
 * Draws placeholder rooms from simple vector shapes: the painting (room.png) and one
 * mask per object instance (masks/*.png). Placeholders stand in for AI-generated
 * paintings and hand-made masks, so the pipeline and the game can be built and tested
 * before the art exists.
 *
 * Each mask is the object's whole shape, as a hand-made mask would be, so masks may
 * overlap; build:rooms resolves overlaps (by depth, then the smaller object wins).
 */
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { LOGICAL_HEIGHT as H, LOGICAL_WIDTH as W } from '../../src/core/display.js';

/** @typedef {[string, Record<string, string | number>]} Shape */

/**
 * Builds an SVG element. In mask mode every visible fill/stroke takes the mask colour.
 * @param {string} tag
 * @param {Record<string, string | number>} attrs
 * @param {string | null} mask mask colour, or null when painting
 */
function el(tag, attrs, mask) {
  const a = { ...attrs };
  if (mask) {
    if (a.fill !== 'none') a.fill = mask;
    if (a.stroke && a.stroke !== 'none') a.stroke = mask;
    delete a.opacity;
  }
  const text = Object.entries(a)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  return `<${tag} ${text}/>`;
}

/** @returns {Shape} */
export const rect = (x, y, w, h, fill, extra = {}) => [
  'rect',
  { x, y, width: w, height: h, fill, ...extra },
];

/** @returns {Shape} */
export const circle = (cx, cy, r, fill, extra = {}) => ['circle', { cx, cy, r, fill, ...extra }];

/** @returns {Shape} */
export const ellipse = (cx, cy, rx, ry, fill, extra = {}) => [
  'ellipse',
  { cx, cy, rx, ry, fill, ...extra },
];

/**
 * @param {[number, number][]} points
 * @returns {Shape}
 */
export const polygon = (points, fill, extra = {}) => [
  'polygon',
  { points: points.map((p) => p.join(',')).join(' '), fill, ...extra },
];

/** @returns {Shape} */
export const line = (x1, y1, x2, y2, stroke, width) => [
  'line',
  { x1, y1, x2, y2, stroke, 'stroke-width': width, 'stroke-linecap': 'round', fill: 'none' },
];

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;

/** @param {Shape[]} shapes  @param {string | null} [mask] */
const draw = (shapes, mask = null) => shapes.map(([tag, attrs]) => el(tag, attrs, mask)).join('');

/**
 * Writes a room's painting and masks, replacing any existing masks.
 * @param {string} roomDir content/rooms/<room>
 * @param {Shape[]} scenery decorative background, never interactive
 * @param {{ name: string, shapes: Shape[] }[]} objects interactive objects in drawing
 *   order (back to front); each name is the mask file name, <objectId> or <objectId>@<n>
 */
export async function writePlaceholderRoom(roomDir, scenery, objects) {
  const masksDir = path.join(roomDir, 'masks');
  await rm(masksDir, { recursive: true, force: true });
  await mkdir(masksDir, { recursive: true });

  const painting = svg(draw(scenery) + objects.map((o) => draw(o.shapes)).join(''));
  await sharp(Buffer.from(painting)).png().toFile(path.join(roomDir, 'room.png'));

  for (const object of objects) {
    // The object in white on black, without anti-aliasing.
    const body =
      `<rect width="${W}" height="${H}" fill="#000000"/>` +
      `<g shape-rendering="crispEdges">${draw(object.shapes, '#ffffff')}</g>`;
    await sharp(Buffer.from(svg(body)))
      .greyscale()
      .png({ palette: true, colours: 2 })
      .toFile(path.join(masksDir, `${object.name}.png`));
  }
}
