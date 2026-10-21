import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateManifest } from '../../src/core/content-validation.js';
import { checkArgs, starterManifest } from '../../tools/new-room.js';

let roomsDir;

beforeEach(async () => {
  roomsDir = await mkdtemp(path.join(tmpdir(), 'words-rooms-'));
  await mkdir(path.join(roomsDir, 'kitchen'));
});

afterEach(async () => {
  await rm(roomsDir, { recursive: true, force: true });
});

describe('new-room', () => {
  it('accepts a new room id and title', () => {
    expect(checkArgs(['living-room', 'Living room'], roomsDir)).toEqual([]);
  });

  it('asks for both arguments', () => {
    expect(checkArgs([], roomsDir)[0]).toMatch(/usage/);
    expect(checkArgs(['garden'], roomsDir)[0]).toMatch(/usage/);
  });

  it('rejects badly formed ids, existing rooms, and blank titles', () => {
    expect(checkArgs(['Living_Room', 'Living room'], roomsDir)[0]).toMatch(/lowercase/);
    expect(checkArgs(['kitchen', 'Kitchen'], roomsDir)[0]).toMatch(/already exists/);
    expect(checkArgs(['garden', '  '], roomsDir)).toEqual(['the title must not be empty']);
  });

  it('starts a draft manifest with no objects', () => {
    expect(starterManifest('garden', 'Garden')).toEqual({
      id: 'garden',
      title: 'Garden',
      draft: true,
      objects: [],
    });
  });

  it('becomes a valid manifest once it lists objects', () => {
    const manifest = { ...starterManifest('garden', 'Garden'), objects: [{ id: 'tree' }] };
    const lexicon = { tree: { label: 'tree', prompt: 'Find the tree.', accepted: ['tree'] } };
    expect(() => validateManifest(manifest, lexicon)).not.toThrow();
  });
});
