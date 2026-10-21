/**
 * Draws the M6 placeholder rooms, the bedroom and the bathroom: content/rooms/<room>/
 * room.png and one mask per object instance, from simple vector shapes.
 *
 * They stand in for AI-generated paintings (style guide) so that room selection and
 * switching can be built and tested with three rooms. Replace each one with a real
 * painting and masks through the mask tool; then delete it from this script.
 *
 * Usage: node tools/make-placeholder-rooms.js [room ...]   (default: all)
 */
import path from 'node:path';
import { LOGICAL_HEIGHT as H, LOGICAL_WIDTH as W } from '../src/core/display.js';
import { circle, ellipse, line, polygon, rect, writePlaceholderRoom } from './lib/placeholder.js';

const OUTLINE = { stroke: '#4a3f5c', 'stroke-width': 8 };

/** Wall, floor boards, and skirting shared by both rooms. */
const shell = (wall, floor, boards) => [
  rect(0, 0, W, 1060, wall),
  rect(0, 1060, W, H - 1060, floor),
  ...Array.from({ length: 16 }, (_, i) => line(i * 136, 1060, i * 136 - 200, H, boards, 6)),
  line(0, 1240, W, 1240, boards, 6),
  line(0, 1400, W, 1400, boards, 6),
  rect(0, 1040, W, 26, '#ffffff'),
];

const window = (x, y) => ({
  name: 'window',
  shapes: [
    rect(x, y, 400, 380, '#ffffff', { rx: 18 }),
    rect(x + 25, y + 25, 350, 330, '#bfe3f5', { rx: 10 }),
    rect(x + 190, y + 25, 20, 330, '#ffffff'),
    rect(x + 25, y + 180, 350, 20, '#ffffff'),
  ],
});

const ROOMS = {
  bedroom: {
    scenery: [
      ...shell('#e6dcf5', '#e2c9a6', '#cdb08a'),
      // Bedside table under the lamp: decoration only.
      rect(1560, 900, 180, 180, '#f2e6d0', { rx: 14, ...OUTLINE }),
    ],
    objects: [
      window(180, 170),
      {
        name: 'clock',
        shapes: [
          circle(800, 230, 75, '#ffffff', { stroke: '#4a3f5c', 'stroke-width': 10 }),
          line(800, 230, 800, 180, '#4a3f5c', 8),
          line(800, 230, 840, 250, '#4a3f5c', 8),
        ],
      },
      {
        name: 'wardrobe',
        shapes: [
          rect(1780, 260, 220, 830, '#c9a3d9', { rx: 18, ...OUTLINE }),
          line(1890, 280, 1890, 1070, '#4a3f5c', 6),
          rect(1862, 620, 14, 90, '#4a3f5c', { rx: 6 }),
          rect(1904, 620, 14, 90, '#4a3f5c', { rx: 6 }),
        ],
      },
      {
        name: 'lamp',
        shapes: [
          rect(1638, 700, 24, 200, '#4a3f5c'),
          polygon(
            [
              [1570, 700],
              [1730, 700],
              [1690, 560],
              [1610, 560],
            ],
            '#ffe08a',
            OUTLINE,
          ),
          rect(1590, 880, 120, 24, '#4a3f5c', { rx: 10 }),
        ],
      },
      {
        name: 'bed',
        shapes: [
          rect(820, 560, 680, 360, '#f5b7c8', { rx: 40, ...OUTLINE }),
          rect(780, 860, 760, 200, '#ffffff', { rx: 24, ...OUTLINE }),
          rect(1000, 880, 540, 180, '#9fd3e6', { rx: 20 }),
          rect(800, 1060, 40, 70, '#4a3f5c'),
          rect(1480, 1060, 40, 70, '#4a3f5c'),
        ],
      },
      {
        name: 'pillow',
        shapes: [rect(840, 780, 220, 110, '#fff6d6', { rx: 40, ...OUTLINE })],
      },
      {
        name: 'desk',
        shapes: [
          rect(120, 800, 520, 50, '#e8b98a', { rx: 10, ...OUTLINE }),
          rect(150, 850, 40, 330, '#c99766'),
          rect(570, 850, 40, 330, '#c99766'),
        ],
      },
      {
        name: 'book',
        shapes: [
          rect(250, 730, 160, 70, '#e86a6a', { rx: 8, ...OUTLINE }),
          rect(266, 742, 128, 14, '#ffffff'),
        ],
      },
      {
        name: 'chair',
        shapes: [
          rect(650, 760, 34, 420, '#8fc79a'),
          rect(530, 1010, 154, 34, '#8fc79a'),
          rect(530, 1044, 26, 230, '#8fc79a'),
          rect(658, 1044, 26, 230, '#8fc79a'),
        ],
      },
      {
        name: 'rug',
        shapes: [ellipse(1160, 1330, 380, 110, '#a8d8b9', OUTLINE)],
      },
      {
        name: 'teddy-bear',
        shapes: [
          circle(1690, 1210, 34, '#c68a5a'),
          circle(1790, 1210, 34, '#c68a5a'),
          circle(1740, 1260, 70, '#c68a5a', OUTLINE),
          ellipse(1740, 1380, 90, 100, '#c68a5a', OUTLINE),
          circle(1715, 1250, 9, '#4a3f5c'),
          circle(1765, 1250, 9, '#4a3f5c'),
          ellipse(1740, 1285, 22, 16, '#f2d2b0'),
        ],
      },
    ],
  },

  bathroom: {
    scenery: [
      ...shell('#d4ecf2', '#c9d6dc', '#b2c2c9'),
      // Wall tiles and the shelf under the mirror: decoration only.
      ...Array.from({ length: 5 }, (_, i) => line(0, 640 + i * 80, W, 640 + i * 80, '#bcdbe3', 4)),
      rect(880, 520, 300, 22, '#ffffff', OUTLINE),
    ],
    objects: [
      window(140, 160),
      {
        name: 'mirror',
        shapes: [
          ellipse(1030, 290, 130, 160, '#ffffff', OUTLINE),
          ellipse(1030, 290, 105, 135, '#dff4fb'),
        ],
      },
      {
        name: 'towel',
        shapes: [
          rect(600, 380, 200, 16, '#4a3f5c', { rx: 8 }),
          rect(620, 396, 160, 300, '#f7a8b8', { rx: 14, ...OUTLINE }),
          rect(620, 640, 160, 20, '#ffffff'),
        ],
      },
      {
        name: 'toothbrush',
        shapes: [
          rect(1110, 410, 18, 110, '#7cc6e8', { rx: 8 }),
          rect(1106, 400, 26, 34, '#ffffff', { rx: 6, stroke: '#4a3f5c', 'stroke-width': 4 }),
        ],
      },
      {
        name: 'soap',
        shapes: [rect(920, 482, 90, 40, '#ffd36e', { rx: 16, ...OUTLINE })],
      },
      {
        name: 'sink',
        shapes: [
          rect(1018, 580, 24, 60, '#a9b4bb'),
          rect(860, 630, 340, 110, '#ffffff', { rx: 50, ...OUTLINE }),
          rect(985, 740, 90, 330, '#ffffff', OUTLINE),
        ],
      },
      {
        name: 'toilet',
        shapes: [
          rect(1300, 560, 200, 220, '#ffffff', { rx: 20, ...OUTLINE }),
          ellipse(1400, 850, 150, 70, '#ffffff', OUTLINE),
          rect(1340, 860, 120, 210, '#ffffff', OUTLINE),
        ],
      },
      {
        name: 'shower',
        shapes: [
          rect(1880, 240, 30, 560, '#a9b4bb'),
          rect(1760, 230, 150, 30, '#a9b4bb'),
          ellipse(1770, 290, 60, 34, '#a9b4bb', OUTLINE),
        ],
      },
      {
        name: 'bathtub',
        shapes: [
          rect(1560, 780, 430, 270, '#ffffff', { rx: 60, ...OUTLINE }),
          rect(1590, 800, 370, 50, '#bfe3f5', { rx: 20 }),
          rect(1600, 1050, 40, 50, '#4a3f5c'),
          rect(1910, 1050, 40, 50, '#4a3f5c'),
        ],
      },
      {
        name: 'bath-mat',
        shapes: [
          rect(1240, 1220, 420, 140, '#b8a3e0', { rx: 30, ...OUTLINE }),
          rect(1270, 1250, 360, 80, 'none', { rx: 20, stroke: '#ffffff', 'stroke-width': 6 }),
        ],
      },
    ],
  },
};

async function main() {
  const names = process.argv.slice(2);
  const unknown = names.filter((n) => !ROOMS[n]);
  if (unknown.length) throw new Error(`Unknown placeholder room(s): ${unknown.join(', ')}`);

  for (const name of names.length ? names : Object.keys(ROOMS)) {
    const dir = path.resolve('content/rooms', name);
    await writePlaceholderRoom(dir, ROOMS[name].scenery, ROOMS[name].objects);
    console.log(
      `Wrote room.png and ${ROOMS[name].objects.length} masks to ${path.relative('.', dir)}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
