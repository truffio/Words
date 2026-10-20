/**
 * Draws the M1 placeholder kitchen (content/rooms/kitchen/room.png) and one mask per
 * object instance (content/rooms/kitchen/masks/*.png) from simple vector shapes.
 *
 * This stands in for the AI-generated painting and hand-made masks until M2. Each mask is
 * the object's whole shape, as a hand-made mask would be, so masks may overlap (the right
 * chair overlaps the stove); build:rooms resolves overlaps, here in favour of the chair.
 *
 * Usage: node tools/make-placeholder-kitchen.js
 */
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { LOGICAL_HEIGHT as H, LOGICAL_WIDTH as W } from '../src/core/display.js';

const ROOM_DIR = path.resolve('content/rooms/kitchen');

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

const rect = (x, y, w, h, fill, extra = {}) => [
  'rect',
  { x, y, width: w, height: h, fill, ...extra },
];
const circle = (cx, cy, r, fill, extra = {}) => ['circle', { cx, cy, r, fill, ...extra }];
const line = (x1, y1, x2, y2, stroke, width) => [
  'line',
  { x1, y1, x2, y2, stroke, 'stroke-width': width, 'stroke-linecap': 'round', fill: 'none' },
];

/** Decorative background: wall, floor, counter. Never interactive. */
const scenery = [
  rect(0, 0, W, 1050, '#f3e3c3'),
  rect(0, 1050, W, H - 1050, '#d9c4a0'),
  ...Array.from({ length: 16 }, (_, i) => line(i * 136, 1050, i * 136 - 200, H, '#c8b18a', 6)),
  line(0, 1210, W, 1210, '#c8b18a', 6),
  line(0, 1380, W, 1380, '#c8b18a', 6),
  rect(0, 1030, W, 24, '#b98d5a'),
  rect(520, 780, 1460, 320, '#9c6b3f'),
  rect(520, 740, 1460, 44, '#e9e4dc'),
  ...[640, 1250].map((x) =>
    rect(x, 820, 120, 240, 'none', { stroke: '#7d5230', 'stroke-width': 8 }),
  ),
  rect(1820, 820, 120, 240, 'none', { stroke: '#7d5230', 'stroke-width': 8 }),
];

/**
 * Interactive objects in drawing order (back to front). Each instance name is the
 * mask file name: <objectId> or <objectId>@<n>.
 */
const objects = [
  {
    name: 'window',
    shapes: [
      rect(820, 180, 400, 380, '#ffffff'),
      rect(845, 205, 350, 330, '#bfe3f5'),
      rect(1010, 205, 20, 330, '#ffffff'),
      rect(845, 360, 350, 20, '#ffffff'),
    ],
  },
  {
    name: 'clock',
    shapes: [
      circle(1480, 220, 70, '#ffffff', { stroke: '#3b3b3b', 'stroke-width': 10 }),
      line(1480, 220, 1480, 175, '#3b3b3b', 8),
      line(1480, 220, 1515, 235, '#3b3b3b', 8),
    ],
  },
  {
    name: 'cupboard',
    shapes: [
      rect(1320, 330, 580, 290, '#b07c4f'),
      rect(1340, 350, 260, 250, '#c08d5f'),
      rect(1620, 350, 260, 250, '#c08d5f'),
      circle(1580, 475, 12, '#5a3a20'),
      circle(1640, 475, 12, '#5a3a20'),
    ],
  },
  {
    name: 'refrigerator',
    shapes: [
      rect(120, 260, 400, 920, '#e8eef2', { rx: 30, stroke: '#9aa7b0', 'stroke-width': 8 }),
      line(130, 580, 510, 580, '#9aa7b0', 8),
      rect(450, 380, 22, 140, '#9aa7b0', { rx: 10 }),
      rect(450, 640, 22, 220, '#9aa7b0', { rx: 10 }),
    ],
  },
  {
    name: 'sink',
    shapes: [
      rect(1005, 630, 30, 120, '#a9b4bb'),
      rect(960, 630, 120, 26, '#a9b4bb', { rx: 12 }),
      rect(860, 730, 320, 70, '#c9d2d8', { rx: 16 }),
      rect(885, 745, 270, 40, '#8fa0aa', { rx: 12 }),
    ],
  },
  {
    name: 'stove',
    shapes: [
      rect(1400, 720, 400, 380, '#4a4f55', { rx: 12 }),
      rect(1430, 820, 340, 230, '#2f3337', { rx: 10 }),
      rect(1450, 840, 300, 150, '#ffb86b', { opacity: 0.35 }),
      ...[1460, 1540, 1660, 1740].map((x) => circle(x, 770, 22, '#d9d9d9')),
    ],
  },
  {
    name: 'chair@1',
    shapes: [
      rect(540, 1000, 30, 330, '#8a5a32'),
      rect(540, 1230, 170, 30, '#8a5a32'),
      rect(540, 1260, 26, 240, '#8a5a32'),
      rect(684, 1260, 26, 240, '#8a5a32'),
    ],
  },
  {
    name: 'chair@2',
    shapes: [
      rect(1630, 1000, 30, 330, '#8a5a32'),
      rect(1490, 1230, 170, 30, '#8a5a32'),
      rect(1490, 1260, 26, 240, '#8a5a32'),
      rect(1634, 1260, 26, 240, '#8a5a32'),
    ],
  },
  {
    name: 'table',
    shapes: [
      rect(740, 1180, 720, 50, '#a86f3e', { rx: 8 }),
      rect(780, 1230, 36, 260, '#8f5c31'),
      rect(1384, 1230, 36, 260, '#8f5c31'),
    ],
  },
  {
    name: 'cup',
    shapes: [
      circle(1170, 1135, 22, 'none', { stroke: '#d6453d', 'stroke-width': 12 }),
      rect(1060, 1090, 100, 90, '#d6453d', { rx: 10 }),
    ],
  },
];

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;

const draw = (shapes, mask = null) => shapes.map(([tag, attrs]) => el(tag, attrs, mask)).join('');

async function main() {
  const masksDir = path.join(ROOM_DIR, 'masks');
  await rm(masksDir, { recursive: true, force: true });
  await mkdir(masksDir, { recursive: true });

  const painting = svg(draw(scenery) + objects.map((o) => draw(o.shapes)).join(''));
  await sharp(Buffer.from(painting)).png().toFile(path.join(ROOM_DIR, 'room.png'));

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

  console.log(`Wrote room.png and ${objects.length} masks to ${path.relative('.', ROOM_DIR)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
