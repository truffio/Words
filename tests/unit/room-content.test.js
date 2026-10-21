import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOGICAL_HEIGHT as H, LOGICAL_WIDTH as W } from '../../src/core/display.js';
import { analyseRoom, loadContent } from '../../tools/lib/room-content.js';

const entry = (label) => ({ label, prompt: `Find the ${label}.`, accepted: [label] });

/** A black PNG with white rectangles. */
async function png(file, rects = [], width = W, height = H) {
  const body = rects
    .map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#000"/>${body}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

let root;
let content;

async function setupRoom({ lexicon, manifest, masks, extraFiles = [] }) {
  await writeFile(path.join(content, 'lexicon.json'), JSON.stringify(lexicon));
  const room = path.join(content, 'rooms', manifest.id ?? 'test');
  await mkdir(path.join(room, 'masks'), { recursive: true });
  await writeFile(path.join(room, 'manifest.json'), JSON.stringify(manifest));
  await png(path.join(room, 'room.png'));
  for (const [name, rects, size] of masks) {
    await png(path.join(room, 'masks', name), rects, ...(size ?? []));
  }
  for (const file of extraFiles) await writeFile(path.join(room, file), '');
}

const load = () => loadContent({ contentDir: content, publicDir: path.join(root, 'public') });

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'words-content-'));
  content = path.join(root, 'content');
  await mkdir(path.join(content, 'rooms'), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('loadContent', () => {
  it('loads a valid room with no problems', async () => {
    await setupRoom({
      lexicon: { stove: entry('stove'), chair: entry('chair') },
      manifest: {
        id: 'test',
        title: 'Test',
        objects: [{ id: 'stove' }, { id: 'chair', depth: 2 }],
      },
      masks: [
        ['stove.png', [[100, 100, 300, 300]]],
        ['chair@1.png', [[600, 600, 100, 200]]],
        ['chair@2.png', [[900, 600, 100, 200]]],
      ],
    });
    const { rooms, problems, warnings } = await load();
    expect(problems).toEqual([]);
    expect(warnings).toEqual([]);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].masks.map((m) => [m.name, m.depth])).toEqual([
      ['chair@1', 2],
      ['chair@2', 2],
      ['stove', 0],
    ]);
  });

  it('reports every problem at once', async () => {
    await setupRoom({
      lexicon: {
        stove: entry('stove'),
        sink: entry('sink'),
        cup: { ...entry('cup'), audio: { word: 'words/cup.mp3' } },
      },
      manifest: {
        id: 'test',
        title: 'Test',
        objects: [{ id: 'stove' }, { id: 'sink' }, { id: 'cup' }],
      },
      masks: [
        ['Stove.png', [[0, 0, 10, 10]]],
        ['oven.png', [[0, 0, 10, 10]]],
        ['sink.png', [[0, 0, 10, 10]], [100, 100]],
        ['cup.png', []],
      ],
    });
    const { problems } = await load();
    const text = problems.join('\n');
    expect(text).toMatch(/"cup" word audio "words\/cup.mp3" does not exist/);
    expect(text).toMatch(/mask "Stove.png" is not named/);
    expect(text).toMatch(/mask "oven.png" is for "oven", which is not in the manifest/);
    expect(text).toMatch(/mask "sink.png" is 100 × 100/);
    expect(text).toMatch(/mask "cup.png" is empty/);
    expect(text).toMatch(/object "stove" has no mask/);
  });

  it('reports a manifest whose id does not match its folder', async () => {
    await setupRoom({
      lexicon: { stove: entry('stove') },
      manifest: { id: 'test', title: 'Test', objects: [{ id: 'stove' }] },
      masks: [['stove.png', [[0, 0, 100, 100]]]],
    });
    const { rename } = await import('node:fs/promises');
    await rename(path.join(content, 'rooms', 'test'), path.join(content, 'rooms', 'other'));
    const { problems } = await load();
    expect(problems.join('\n')).toMatch(/manifest id "test" does not match its folder name/);
  });

  it('warns about unused files and unused words', async () => {
    await setupRoom({
      lexicon: { stove: entry('stove'), lamp: entry('lamp') },
      manifest: { id: 'test', title: 'Test', objects: [{ id: 'stove' }] },
      masks: [['stove.png', [[0, 0, 100, 100]]]],
      extraFiles: ['notes.txt'],
    });
    const { problems, warnings } = await load();
    expect(problems).toEqual([]);
    expect(warnings).toContain('room "test": unused file "notes.txt"');
    expect(warnings).toContain('lexicon: "lamp" is not used by any room');
  });
});

describe('loadContent: draft rooms', () => {
  it("reports a draft room's problems as warnings and leaves it out of the build", async () => {
    await setupRoom({
      lexicon: { stove: entry('stove') },
      manifest: { id: 'test', title: 'Test', draft: true, objects: [{ id: 'stove' }] },
      masks: [],
    });
    const { rooms, drafts, draftIds, problems, warnings } = await load();
    expect(problems).toEqual([]);
    expect(warnings).toContain('room "test": object "stove" has no mask (draft)');
    expect(rooms).toEqual([]);
    expect(drafts).toEqual([]);
    expect(draftIds).toEqual(['test']);
  });

  it('accepts the starter manifest of a new room', async () => {
    await setupRoom({
      lexicon: { stove: entry('stove') },
      manifest: { id: 'test', title: 'Test', draft: true, objects: [] },
      masks: [],
    });
    const { problems, warnings, draftIds } = await load();
    expect(problems).toEqual([]);
    expect(warnings).toContain('room "test": /objects must NOT have fewer than 1 items (draft)');
    expect(draftIds).toEqual(['test']);
  });

  it('returns a complete draft separately from the rooms to build', async () => {
    await setupRoom({
      lexicon: { stove: entry('stove') },
      manifest: { id: 'test', title: 'Test', draft: true, objects: [{ id: 'stove' }] },
      masks: [['stove.png', [[0, 0, 100, 100]]]],
    });
    const { rooms, drafts, problems, warnings } = await load();
    expect(problems).toEqual([]);
    expect(warnings).toEqual([]);
    expect(rooms).toEqual([]);
    expect(drafts.map((r) => r.id)).toEqual(['test']);
  });

  it('still reports the problems of a room that is not a draft', async () => {
    await setupRoom({
      lexicon: { stove: entry('stove') },
      manifest: { id: 'test', title: 'Test', draft: false, objects: [{ id: 'stove' }] },
      masks: [],
    });
    const { problems } = await load();
    expect(problems).toContain('room "test": object "stove" has no mask');
  });
});

describe('analyseRoom', () => {
  it('resolves overlaps, pads regions, and warns about both', async () => {
    await setupRoom({
      lexicon: { cabinet: entry('cabinet'), cup: entry('cup'), pin: entry('pin') },
      manifest: {
        id: 'test',
        title: 'Test',
        objects: [{ id: 'cabinet' }, { id: 'cup' }, { id: 'pin' }],
      },
      masks: [
        ['cabinet.png', [[200, 200, 400, 400]]],
        ['cup.png', [[300, 300, 100, 100]]],
        // A tiny object boxed in by the cabinet, so it cannot reach the minimum tap size.
        ['pin.png', [[500, 500, 10, 10]]],
      ],
    });
    const { rooms } = await load();
    const analysis = analyseRoom(rooms[0]);
    expect(analysis.problems).toEqual([]);
    expect(analysis.warnings.join('\n')).toMatch(/"cabinet" and "cup" overlap .*"cup" wins/);
    expect(analysis.warnings.join('\n')).toMatch(/"pin" stays below the 80 px minimum tap size/);

    const [cabinet, cup] = analysis.hitBounds;
    // The cabinet grows by the base padding (8 logical px) on every side.
    expect(cabinet).toEqual({ x: 96, y: 96, w: 208, h: 208 });
    // The cup stays inside the cabinet: it cannot grow into it.
    expect(cup).toEqual({ x: 150, y: 150, w: 50, h: 50 });
  });
});
