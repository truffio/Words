/**
 * build:rooms (minimal, M1) — turns each room's painting and masks into the files the
 * game loads, in public/assets/rooms/<room>/:
 *
 *   background.webp  the painting
 *   hitmap.bin       instance index per hit-map pixel (half resolution), run-length encoded
 *   layout.json      instances with objectId, bounds and tap point (logical coordinates)
 *
 * Fails with a list of problems on invalid content: schema errors, unknown objects,
 * missing or extra masks, wrong mask size, empty masks, overlapping masks.
 *
 * Usage: node tools/build-rooms.js
 */
import { readdir, readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ContentError, validateLexicon, validateManifest } from '../src/core/content-validation.js';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../src/core/display.js';
import { encodeHitmap } from '../src/core/hitmap.js';
import {
  combineMasks,
  downsample,
  instanceBounds,
  parseMaskName,
  tapPoints,
} from './lib/room-build.js';

const CONTENT_DIR = path.resolve('content');
const OUTPUT_DIR = path.resolve('public/assets/rooms');
const HITMAP_FACTOR = 2;

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

/** Reads a mask as one byte per pixel: 1 inside the object, 0 outside. */
async function readMask(file) {
  const { data, info } = await sharp(file)
    .flatten({ background: '#000000' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = new Uint8Array(info.width * info.height);
  for (let p = 0; p < pixels.length; p++) pixels[p] = data[p * info.channels] >= 128 ? 1 : 0;
  return { pixels, width: info.width, height: info.height };
}

async function buildRoom(roomId, lexicon) {
  const roomDir = path.join(CONTENT_DIR, 'rooms', roomId);
  const manifest = validateManifest(await readJson(path.join(roomDir, 'manifest.json')), lexicon);
  const problems = [];
  if (manifest.id !== roomId) {
    problems.push(`manifest id "${manifest.id}" does not match its folder "${roomId}"`);
  }

  const paintingFile = path.join(roomDir, 'room.png');
  const painting = await sharp(paintingFile).metadata();
  if (painting.width !== LOGICAL_WIDTH || painting.height !== LOGICAL_HEIGHT) {
    problems.push(
      `room.png is ${painting.width} × ${painting.height}, expected ${LOGICAL_WIDTH} × ${LOGICAL_HEIGHT}`,
    );
  }

  const roomObjects = new Set(manifest.objects.map((o) => o.id));
  const masked = new Set();
  const masks = [];
  const files = (await readdir(path.join(roomDir, 'masks')))
    .filter((f) => f.endsWith('.png'))
    .sort();

  for (const file of files) {
    const parsed = parseMaskName(path.basename(file, '.png'));
    if (!parsed) {
      problems.push(`mask "${file}" is not named <objectId>.png or <objectId>@<n>.png`);
      continue;
    }
    if (!roomObjects.has(parsed.objectId)) {
      problems.push(`mask "${file}" is for "${parsed.objectId}", which is not in the manifest`);
      continue;
    }
    const mask = await readMask(path.join(roomDir, 'masks', file));
    if (mask.width !== LOGICAL_WIDTH || mask.height !== LOGICAL_HEIGHT) {
      problems.push(
        `mask "${file}" is ${mask.width} × ${mask.height}, expected the painting's size`,
      );
      continue;
    }
    masked.add(parsed.objectId);
    masks.push({ ...parsed, pixels: mask.pixels });
  }

  for (const id of roomObjects) {
    if (!masked.has(id)) problems.push(`object "${id}" has no mask`);
  }

  const { index, problems: maskProblems } = combineMasks(masks, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  problems.push(...maskProblems);
  if (problems.length) throw new ContentError(`Room "${roomId}"`, problems);

  const hitmap = downsample(index, LOGICAL_WIDTH, LOGICAL_HEIGHT, HITMAP_FACTOR);
  const bounds = instanceBounds(index, LOGICAL_WIDTH, masks.length);
  const taps = tapPoints(hitmap.pixels, hitmap.width, hitmap.height, masks.length);

  const layout = {
    room: roomId,
    size: [LOGICAL_WIDTH, LOGICAL_HEIGHT],
    hitmap: { width: hitmap.width, height: hitmap.height },
    instances: masks.map((mask, i) => {
      if (!taps[i]) {
        throw new ContentError(`Room "${roomId}"`, [
          `mask "${mask.name}" is too small to survive the half-resolution hit map`,
        ]);
      }
      return {
        index: i + 1,
        name: mask.name,
        objectId: mask.objectId,
        bounds: bounds[i],
        tap: [(taps[i][0] + 0.5) * HITMAP_FACTOR, (taps[i][1] + 0.5) * HITMAP_FACTOR],
      };
    }),
  };

  const outDir = path.join(OUTPUT_DIR, roomId);
  await mkdir(outDir, { recursive: true });
  await sharp(paintingFile).webp({ quality: 85 }).toFile(path.join(outDir, 'background.webp'));
  await writeFile(path.join(outDir, 'hitmap.bin'), encodeHitmap(hitmap.pixels));
  await writeFile(path.join(outDir, 'layout.json'), `${JSON.stringify(layout, null, 2)}\n`);

  return layout;
}

async function main() {
  const lexicon = validateLexicon(await readJson(path.join(CONTENT_DIR, 'lexicon.json')));
  const entries = await readdir(path.join(CONTENT_DIR, 'rooms'), { withFileTypes: true });
  const rooms = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  await rm(OUTPUT_DIR, { recursive: true, force: true });
  for (const roomId of rooms) {
    const layout = await buildRoom(roomId, lexicon);
    console.log(`build:rooms: ${roomId} — ${layout.instances.length} instances`);
  }
}

main().catch((error) => {
  console.error(error instanceof ContentError ? `build:rooms failed. ${error.message}` : error);
  process.exit(1);
});
