/**
 * build:rooms — turns each room's painting and masks into the files the game loads, in
 * public/assets/rooms/<room>/:
 *
 *   background.webp   the painting
 *   thumbnail.webp    a small copy of the painting for the room selection screen
 *   objects.json      Phaser multi-atlas of object cut-outs and their white glow halos,
 *                     with pages objects-<n>.webp
 *   hitmap.bin        cell per hit-map pixel (half resolution), run-length encoded,
 *                     after padding; a cell is a set of instances (shared pixels)
 *   layout.json       instances: objectId, bounds, hit bounds, tap point, cut-out and
 *                     glow frames; the instances of each hit-map cell (`hitSets`); and
 *                     the room's whole/part object pairs (`parts`)
 *
 * and a review image, reports/rooms/<room>-debug-hits.png, showing every hit region.
 *
 * Runs the same checks as validate:content first and stops on any problem. Draft rooms
 * (`"draft": true` in the manifest) are skipped.
 *
 * Usage: node tools/build-rooms.js
 */
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../src/core/display.js';
import { encodeHitmap } from '../src/core/hitmap.js';
import { cutout, glowHalo, packShelves, regionOverlay } from './lib/room-build.js';
import { analyseRoom, HITMAP_FACTOR, loadContent } from './lib/room-content.js';
import { report } from './lib/report.js';

const OUTPUT_DIR = path.resolve('public/assets/rooms');
const REPORT_DIR = path.resolve('reports/rooms');

/** File size budgets per room (TECHNICAL.md §6). */
const BUDGETS = {
  background: 600 * 1024,
  atlas: 1.5 * 1024 * 1024,
  hitmap: 100 * 1024,
};

const PALETTE = [
  [230, 25, 75],
  [60, 180, 75],
  [0, 130, 200],
  [245, 130, 48],
  [145, 30, 180],
  [70, 200, 220],
  [240, 50, 230],
  [150, 190, 30],
  [0, 128, 128],
  [170, 110, 40],
  [128, 0, 0],
  [0, 0, 128],
];
const colourOf = (value) => PALETTE[(value - 1) % PALETTE.length];

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const escapeXml = (s) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Thumbnail size for the room selection screen (4:3, sharp on 2× screens). */
const THUMBNAIL = { width: 480, height: 360 };

/** Glow halo width around each object (logical px). */
const GLOW_RADIUS = 24;

/** Frame name of an instance's glow halo in the atlas. */
const glowFrame = (name) => `${name}:glow`;

async function writeAtlas(room, analysis, rgba, outDir) {
  const args = (i) => [analysis.index, LOGICAL_WIDTH, LOGICAL_HEIGHT, i + 1, analysis.bounds[i]];
  const cutouts = room.masks.map((mask, i) => ({
    name: mask.name,
    ...cutout(rgba, ...args(i), analysis.sets),
  }));
  const halos = room.masks.map((mask, i) => ({
    name: glowFrame(mask.name),
    ...glowHalo(...args(i), GLOW_RADIUS, analysis.sets),
  }));
  const pieces = [...cutouts, ...halos];
  const { pages, placements } = packShelves(pieces);

  const textures = [];
  let bytes = 0;
  for (const [n, page] of pages.entries()) {
    const image = `objects-${n}.webp`;
    const onPage = pieces.filter((p) => placements.get(p.name).page === n);
    const composites = await Promise.all(
      onPage.map(async (piece) => {
        const { x, y } = placements.get(piece.name);
        const input = await sharp(Buffer.from(piece.data.buffer), {
          raw: { width: piece.w, height: piece.h, channels: 4 },
        })
          .png()
          .toBuffer();
        return { input, left: x, top: y };
      }),
    );
    const file = path.join(outDir, image);
    await sharp({
      create: {
        width: page.width,
        height: page.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .webp({ quality: 90, alphaQuality: 100 })
      .toFile(file);
    bytes += (await stat(file)).size;

    textures.push({
      image,
      format: 'RGBA8888',
      size: { w: page.width, h: page.height },
      scale: 1,
      frames: onPage.map((piece) => {
        const { x, y } = placements.get(piece.name);
        return {
          filename: piece.name,
          rotated: false,
          trimmed: false,
          sourceSize: { w: piece.w, h: piece.h },
          spriteSourceSize: { x: 0, y: 0, w: piece.w, h: piece.h },
          frame: { x, y, w: piece.w, h: piece.h },
        };
      }),
    });
  }

  await writeFile(
    path.join(outDir, 'objects.json'),
    `${JSON.stringify({ textures, meta: { app: 'words build:rooms' } }, null, 2)}\n`,
  );
  return { cutouts, halos, pages, bytes };
}

async function writeDebugHits(room, analysis, layout) {
  const { hitmap } = analysis;
  const overlay = await sharp(
    Buffer.from(
      regionOverlay(hitmap.pixels, hitmap.width, hitmap.height, colourOf, analysis.sets).buffer,
    ),
    {
      raw: { width: hitmap.width, height: hitmap.height, channels: 4 },
    },
  )
    .resize(LOGICAL_WIDTH, LOGICAL_HEIGHT, { kernel: 'nearest' })
    .png()
    .toBuffer();

  const labels = layout.instances
    .map(({ name, tap: [x, y] }) => {
      const w = name.length * 19 + 24;
      return (
        `<circle cx="${x}" cy="${y}" r="9" fill="#ffffff" stroke="#000000" stroke-width="4"/>` +
        `<rect x="${x - w / 2}" y="${y + 16}" width="${w}" height="44" rx="8" fill="#000000" opacity="0.7"/>` +
        `<text x="${x}" y="${y + 48}" font-family="sans-serif" font-size="32" fill="#ffffff" text-anchor="middle">${escapeXml(name)}</text>`
      );
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LOGICAL_WIDTH}" height="${LOGICAL_HEIGHT}">${labels}</svg>`;

  await mkdir(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `${room.id}-debug-hits.png`);
  await sharp(room.paintingFile)
    .composite([{ input: overlay }, { input: Buffer.from(svg) }])
    .png()
    .toFile(file);
  return file;
}

async function buildRoom(room) {
  const analysis = analyseRoom(room);
  const warnings = [...analysis.warnings];
  const { notes } = analysis;
  if (analysis.problems.length) return { problems: analysis.problems, warnings, notes };

  const outDir = path.join(OUTPUT_DIR, room.id);
  await mkdir(outDir, { recursive: true });

  const { data: rgba } = await sharp(room.paintingFile)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const backgroundFile = path.join(outDir, 'background.webp');
  await sharp(room.paintingFile).webp({ quality: 85 }).toFile(backgroundFile);
  const background = (await stat(backgroundFile)).size;
  await sharp(room.paintingFile)
    .resize(THUMBNAIL.width, THUMBNAIL.height)
    .webp({ quality: 80 })
    .toFile(path.join(outDir, 'thumbnail.webp'));

  const atlas = await writeAtlas(
    room,
    analysis,
    new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.length),
    outDir,
  );

  const hitmapBytes = encodeHitmap(analysis.hitmap.pixels);
  await writeFile(path.join(outDir, 'hitmap.bin'), hitmapBytes);

  const toLogical = (b) =>
    b && {
      x: b.x * HITMAP_FACTOR,
      y: b.y * HITMAP_FACTOR,
      w: b.w * HITMAP_FACTOR,
      h: b.h * HITMAP_FACTOR,
    };

  const layout = {
    room: room.id,
    size: [LOGICAL_WIDTH, LOGICAL_HEIGHT],
    hitmap: { width: analysis.hitmap.width, height: analysis.hitmap.height },
    atlas: 'objects.json',
    instances: room.masks.map((mask, i) => {
      const piece = atlas.cutouts[i];
      const halo = atlas.halos[i];
      return {
        index: i + 1,
        name: mask.name,
        objectId: mask.objectId,
        bounds: analysis.bounds[i],
        hitBounds: toLogical(analysis.hitBounds[i]),
        tap: [
          (analysis.taps[i][0] + 0.5) * HITMAP_FACTOR,
          (analysis.taps[i][1] + 0.5) * HITMAP_FACTOR,
        ],
        cutout: { frame: mask.name, x: piece.x, y: piece.y },
        glow: { frame: glowFrame(mask.name), x: halo.x, y: halo.y },
      };
    }),
    hitSets: analysis.sets,
    parts: analysis.parts,
  };
  await writeFile(path.join(outDir, 'layout.json'), `${JSON.stringify(layout, null, 2)}\n`);

  const debugFile = await writeDebugHits(room, analysis, layout);

  const label = `room "${room.id}"`;
  const sizes = { background, atlas: atlas.bytes, hitmap: hitmapBytes.byteLength };
  for (const [key, size] of Object.entries(sizes)) {
    if (size > BUDGETS[key]) {
      warnings.push(`${label}: ${key} is ${kb(size)}, over its ${kb(BUDGETS[key])} budget`);
    }
  }

  const summary =
    `${room.id}: ${layout.instances.length} instances; background ${kb(background)}, ` +
    `atlas ${kb(atlas.bytes)} on ${atlas.pages.length} page(s) ` +
    `(${atlas.pages.map((p) => `${p.width}×${p.height}`).join(', ')}), hitmap ${kb(hitmapBytes.byteLength)}; ` +
    `review: ${path.relative('.', debugFile)}`;
  return { problems: [], warnings, notes, summary };
}

async function main() {
  const content = await loadContent({
    contentDir: path.resolve('content'),
    publicDir: path.resolve('public'),
  });
  const problems = [...content.problems];
  const warnings = [...content.warnings];
  const notes = [];
  const summaries = [];

  if (!problems.length) {
    await rm(OUTPUT_DIR, { recursive: true, force: true });
    await rm(REPORT_DIR, { recursive: true, force: true });
    for (const room of content.rooms) {
      const result = await buildRoom(room);
      problems.push(...result.problems);
      warnings.push(...result.warnings);
      notes.push(...result.notes);
      if (result.summary) summaries.push(result.summary);
    }
  }

  const ok = report('build:rooms', { problems, warnings, notes });
  for (const summary of summaries) console.log(`build:rooms: ${summary}`);
  for (const id of content.draftIds) console.log(`build:rooms: ${id}: draft, skipped`);
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
