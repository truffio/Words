/**
 * Loads and checks all vocabulary and room content. Shared by validate:content (checks
 * only) and build:rooms (checks, then writes the game files), so both apply exactly the
 * same rules.
 *
 * Problems make the content invalid; warnings are reported but do not fail.
 *
 * A room whose manifest sets `"draft": true` is unfinished: its problems are reported
 * as warnings, and it is returned in `drafts` rather than `rooms`, so it is never built
 * and never blocks dev, CI, or deployment.
 */
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  ContentError,
  validateLexicon,
  validateManifest,
} from '../../src/core/content-validation.js';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../../src/core/display.js';
import {
  combineMasks,
  downsample,
  instanceBounds,
  padRegions,
  parseMaskName,
  tapPoints,
} from './room-build.js';

/** Hit map resolution relative to the logical canvas. */
export const HITMAP_FACTOR = 2;
/** Every hit region grows by this much (logical px), so thin parts are easier to hit. */
export const BASE_HIT_PADDING = 8;
/** Minimum hit region size (logical px), about 44 pt on an iPad screen. */
export const MIN_TAP_SIZE = 80;
/**
 * Two objects sharing at least this fraction of the smaller one's pixels are a whole
 * and its part (a stereo system and its speaker); smaller shared areas are incidental.
 */
export const PART_SHARE = 0.5;

const ROOM_FILES = new Set(['manifest.json', 'room.png', 'masks']);

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file, problems, label) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    problems.push(`${label}: cannot read ${path.basename(file)} (${error.message})`);
    return null;
  }
}

/** Whether a room's manifest marks it as a draft (false if the manifest is unreadable). */
async function isDraft(roomDir) {
  try {
    return JSON.parse(await readFile(path.join(roomDir, 'manifest.json'), 'utf8')).draft === true;
  } catch {
    return false;
  }
}

/** Runs a validator, turning a ContentError into problem lines. */
function collect(fn, problems, label) {
  try {
    fn();
    return true;
  } catch (error) {
    if (!(error instanceof ContentError)) throw error;
    problems.push(...error.problems.map((p) => `${label}: ${p}`));
    return false;
  }
}

/** Reads a mask as one byte per pixel: 1 inside the object, 0 outside. */
async function readMask(file) {
  const { data, info } = await sharp(file)
    .flatten({ background: '#000000' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = new Uint8Array(info.width * info.height);
  let area = 0;
  for (let p = 0; p < pixels.length; p++) {
    if (data[p * info.channels] >= 128) {
      pixels[p] = 1;
      area++;
    }
  }
  return { pixels, area, width: info.width, height: info.height };
}

/**
 * @typedef {object} RoomSource
 * @property {string} id
 * @property {string} dir
 * @property {object} manifest
 * @property {string} paintingFile
 * @property {(import('./room-build.js').Mask & { hitPadding: number })[]} masks
 */

async function loadRoom(roomId, roomDir, lexicon, problems, warnings) {
  const label = `room "${roomId}"`;
  const before = problems.length;

  const manifest = await readJson(path.join(roomDir, 'manifest.json'), problems, label);
  if (!manifest || !collect(() => validateManifest(manifest, lexicon), problems, label)) {
    return null;
  }
  if (manifest.id !== roomId) {
    problems.push(`${label}: manifest id "${manifest.id}" does not match its folder name`);
  }

  for (const entry of await readdir(roomDir)) {
    if (!ROOM_FILES.has(entry)) warnings.push(`${label}: unused file "${entry}"`);
  }

  const paintingFile = path.join(roomDir, 'room.png');
  if (!(await exists(paintingFile))) {
    problems.push(`${label}: room.png is missing`);
  } else {
    const { width, height } = await sharp(paintingFile).metadata();
    if (width !== LOGICAL_WIDTH || height !== LOGICAL_HEIGHT) {
      problems.push(
        `${label}: room.png is ${width} × ${height}, expected ${LOGICAL_WIDTH} × ${LOGICAL_HEIGHT}`,
      );
    }
  }

  const settings = new Map(manifest.objects.map((o) => [o.id, o]));
  const masked = new Set();
  const masks = [];
  const masksDir = path.join(roomDir, 'masks');
  const files = (await exists(masksDir)) ? (await readdir(masksDir)).sort() : [];

  for (const file of files) {
    if (!file.endsWith('.png')) {
      warnings.push(`${label}: unused file "masks/${file}"`);
      continue;
    }
    const parsed = parseMaskName(path.basename(file, '.png'));
    if (!parsed) {
      problems.push(`${label}: mask "${file}" is not named <objectId>.png or <objectId>@<n>.png`);
      continue;
    }
    const object = settings.get(parsed.objectId);
    if (!object) {
      problems.push(
        `${label}: mask "${file}" is for "${parsed.objectId}", which is not in the manifest`,
      );
      continue;
    }
    const mask = await readMask(path.join(masksDir, file));
    if (mask.width !== LOGICAL_WIDTH || mask.height !== LOGICAL_HEIGHT) {
      problems.push(
        `${label}: mask "${file}" is ${mask.width} × ${mask.height}, expected the painting's size`,
      );
      continue;
    }
    if (mask.area === 0) {
      problems.push(`${label}: mask "${file}" is empty`);
      continue;
    }
    masked.add(parsed.objectId);
    masks.push({
      ...parsed,
      pixels: mask.pixels,
      depth: object.depth ?? 0,
      hitPadding: object.hitPadding ?? 0,
    });
  }

  for (const id of settings.keys()) {
    if (!masked.has(id)) problems.push(`${label}: object "${id}" has no mask`);
  }
  if (masks.length > 255) {
    problems.push(`${label}: a room can have at most 255 instances, got ${masks.length}`);
  }

  if (problems.length > before) return null;
  return { id: roomId, dir: roomDir, manifest, paintingFile, masks };
}

/**
 * Loads the lexicon and every room, checking everything that can be checked without
 * building. Rooms with problems are left out of `rooms` (and drafts out of `drafts`).
 * @param {{ contentDir: string, publicDir: string }} dirs
 * @returns {Promise<{ lexicon: object, rooms: RoomSource[], drafts: RoomSource[], draftIds: string[], problems: string[], warnings: string[] }>}
 */
export async function loadContent({ contentDir, publicDir }) {
  const problems = [];
  const warnings = [];

  const lexicon =
    (await readJson(path.join(contentDir, 'lexicon.json'), problems, 'lexicon')) ?? {};
  collect(() => validateLexicon(lexicon), problems, 'lexicon');

  for (const [id, entry] of Object.entries(lexicon)) {
    for (const [kind, ref] of Object.entries(entry?.audio ?? {})) {
      if (!(await exists(path.join(publicDir, 'assets', 'audio', ref)))) {
        problems.push(
          `lexicon: "${id}" ${kind} audio "${ref}" does not exist in public/assets/audio`,
        );
      }
    }
  }

  const roomsDir = path.join(contentDir, 'rooms');
  const roomIds = (await readdir(roomsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const rooms = [];
  const drafts = [];
  const draftIds = [];
  for (const roomId of roomIds) {
    const roomDir = path.join(roomsDir, roomId);
    const roomProblems = [];
    const room = await loadRoom(roomId, roomDir, lexicon, roomProblems, warnings);
    if (await isDraft(roomDir)) {
      draftIds.push(roomId);
      warnings.push(...roomProblems.map((p) => `${p} (draft)`));
      if (room) drafts.push(room);
    } else {
      problems.push(...roomProblems);
      if (room) rooms.push(room);
    }
  }

  const loaded = [...rooms, ...drafts];
  const used = new Set(loaded.flatMap((r) => r.manifest.objects.map((o) => o.id)));
  for (const id of Object.keys(lexicon)) {
    if (!used.has(id) && roomIds.length === loaded.length) {
      warnings.push(`lexicon: "${id}" is not used by any room`);
    }
  }

  return { lexicon, rooms, drafts, draftIds, problems, warnings };
}

/**
 * Whole/part pairs of objects: objects whose masks share at least PART_SHARE of the
 * smaller one's pixels, as [larger, smaller] object IDs. Which one is the part does not
 * matter to the game (and two masks of about the same size cannot tell).
 * @param {import('./room-build.js').Mask[]} masks
 * @param {number[]} areas pixel count of each mask
 * @param {import('./room-build.js').Overlap[]} overlaps
 * @returns {[string, string][]}
 */
function wholesAndParts(masks, areas, overlaps) {
  const byName = new Map(masks.map((mask, i) => [mask.name, { ...mask, area: areas[i] }]));
  const pairs = new Map();
  for (const o of overlaps) {
    const [whole, part] = [byName.get(o.a), byName.get(o.b)].sort((x, y) => y.area - x.area);
    if (o.front || whole.objectId === part.objectId || o.pixels < PART_SHARE * part.area) {
      continue;
    }
    pairs.set(`${whole.objectId}|${part.objectId}`, [whole.objectId, part.objectId]);
  }
  return [...pairs.values()];
}

/**
 * Resolves a room's hit regions: combines masks (overlapping masks share their pixels,
 * unless one has a higher depth), builds the half-resolution hit map, and pads small
 * and thin regions.
 *
 * Overlaps are reported as notes: they are expected (a whole and its parts, an object
 * in front of another), but worth a look in the review image.
 * @param {RoomSource} room
 */
export function analyseRoom(room) {
  const label = `room "${room.id}"`;
  const warnings = [];
  const notes = [];
  const { masks } = room;

  const { index, sets, areas, overlaps } = combineMasks(masks, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  const parts = wholesAndParts(masks, areas, overlaps);
  for (const o of overlaps) {
    if (o.front) {
      const behind = o.front === o.a ? o.b : o.a;
      notes.push(`${label}: "${o.front}" is in front of "${behind}" on ${o.pixels} pixels`);
    } else {
      notes.push(`${label}: "${o.a}" and "${o.b}" share ${o.pixels} pixels`);
    }
  }
  for (const [a, b] of parts) notes.push(`${label}: "${a}" and "${b}" are a whole and its part`);

  const bounds = instanceBounds(index, LOGICAL_WIDTH, masks.length, sets);
  const unpadded = downsample(index, LOGICAL_WIDTH, LOGICAL_HEIGHT, HITMAP_FACTOR);
  const taps = tapPoints(unpadded.pixels, unpadded.width, unpadded.height, masks.length, sets);

  const toHitmap = (logical) => Math.round(logical / HITMAP_FACTOR);
  const padded = padRegions(unpadded.pixels, unpadded.width, unpadded.height, masks.length, {
    basePad: toHitmap(BASE_HIT_PADDING),
    minSize: toHitmap(MIN_TAP_SIZE),
    extraPad: masks.map((m) => toHitmap(m.hitPadding)),
    sets,
  });
  for (const i of padded.tooSmall) {
    warnings.push(
      `${label}: "${masks[i].name}" stays below the ${MIN_TAP_SIZE} px minimum tap size (not enough free space around it)`,
    );
  }

  const problems = [];
  masks.forEach((mask, i) => {
    if (!bounds[i]) problems.push(`${label}: "${mask.name}" is completely hidden by other masks`);
    else if (!taps[i]) {
      problems.push(`${label}: "${mask.name}" is too small to survive the half-resolution hit map`);
    }
  });

  const hitBounds = instanceBounds(padded.index, unpadded.width, masks.length, sets);
  return {
    index,
    sets,
    parts,
    bounds,
    taps,
    hitmap: { pixels: padded.index, width: unpadded.width, height: unpadded.height },
    hitBounds,
    warnings,
    notes,
    problems,
  };
}
