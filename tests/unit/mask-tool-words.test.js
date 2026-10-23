import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { idFromLabel, normaliseSpelling } from '../../tools/mask-tool/word-names.js';
import { createWords, manifestText } from '../../tools/mask-tool/words.js';

const LEXICON = {
  chair: { label: 'chair', prompt: 'Find a chair.', accepted: ['chair'] },
  sink: { label: 'sink', prompt: 'Find the sink.', accepted: ['sink'] },
  'bath-mat': { label: 'bath mat', prompt: 'Find the bath mat.', accepted: ['bath mat', 'mat'] },
};

const MANIFEST = `{
  "id": "kitchen",
  "title": "Kitchen",
  "objects": [
    { "id": "sink", "difficulty": 1 },
    { "id": "bath-mat", "difficulty": 3 }
  ]
}
`;

let contentDir;
let words;
const lexiconFile = () => path.join(contentDir, 'lexicon.json');
const manifestFile = () => path.join(contentDir, 'rooms', 'kitchen', 'manifest.json');
const masksDir = () => path.join(contentDir, 'rooms', 'kitchen', 'masks');
const readLexicon = async () => JSON.parse(await readFile(lexiconFile(), 'utf8'));
const readManifest = async () => JSON.parse(await readFile(manifestFile(), 'utf8'));

beforeEach(async () => {
  contentDir = await mkdtemp(path.join(tmpdir(), 'words-content-'));
  await mkdir(masksDir(), { recursive: true });
  await writeFile(lexiconFile(), `${JSON.stringify(LEXICON, null, 2)}\n`);
  await writeFile(manifestFile(), MANIFEST);
  words = createWords(contentDir);
});

afterEach(async () => {
  await rm(contentDir, { recursive: true, force: true });
});

describe('word names', () => {
  it('derives IDs and spellings from labels', () => {
    expect(idFromLabel(' Frying pan ')).toBe('frying-pan');
    expect(idFromLabel('hot-water faucet')).toBe('hot-water-faucet');
    expect(normaliseSpelling(' Hot-Water  Faucet ')).toBe('hot water faucet');
  });

  it('writes manifests with one object per line', () => {
    expect(manifestText(JSON.parse(MANIFEST))).toBe(MANIFEST);
  });
});

describe('adding a word', () => {
  it('reuses an existing lexicon entry and only lists it in the room', async () => {
    const before = await readFile(lexiconFile(), 'utf8');
    expect(await words.add('kitchen', { id: 'chair', difficulty: 1 })).toEqual({
      id: 'chair',
      reused: true,
    });
    expect(await readFile(lexiconFile(), 'utf8')).toBe(before);
    expect((await readManifest()).objects.at(-1)).toEqual({ id: 'chair', difficulty: 1 });
  });

  it('creates a lexicon entry for a new word, with its ID, prompt, and spellings', async () => {
    await words.add('kitchen', { label: ' Frying  Pan', accepted: ['Skillet', ' ', 'fry pan'] });
    expect((await readLexicon())['frying-pan']).toEqual({
      label: 'frying pan',
      prompt: 'Find the frying pan.',
      accepted: ['frying pan', 'skillet', 'fry pan'],
    });
    expect((await readManifest()).objects.at(-1)).toEqual({ id: 'frying-pan', difficulty: 2 });
  });

  it('keeps the files formatted', async () => {
    await words.add('kitchen', { label: 'pot', prompt: 'Find a pot.', difficulty: 1 });
    const manifest = await readFile(manifestFile(), 'utf8');
    expect(manifest).toContain('    { "id": "pot", "difficulty": 1 }\n  ]\n}\n');
    expect(await readFile(lexiconFile(), 'utf8')).toContain(
      '  "pot": {\n    "label": "pot",\n    "prompt": "Find a pot.",\n    "accepted": ["pot"]\n  }\n}\n',
    );
  });

  it('rejects invalid IDs, words already in the room, and clashing spellings', async () => {
    await expect(words.add('kitchen', { id: 'Bad_Id', label: 'bad' })).rejects.toThrow(
      /not a valid ID/,
    );
    await expect(words.add('kitchen', { id: 'sink' })).rejects.toMatchObject({ status: 409 });
    await expect(words.add('kitchen', { label: 'rug', accepted: ['mat'] })).rejects.toThrow(
      /both accept the spelling "mat"/,
    );
    await expect(words.add('kitchen', { label: 'cup', difficulty: 5 })).rejects.toThrow(
      /difficulty/,
    );
    await expect(words.add('kitchen', { label: '' })).rejects.toThrow(/valid ID/);
  });

  it('changes nothing when a word is rejected', async () => {
    const lexicon = await readFile(lexiconFile(), 'utf8');
    await expect(words.add('kitchen', { label: 'rug', accepted: ['mat'] })).rejects.toThrow();
    expect(await readFile(lexiconFile(), 'utf8')).toBe(lexicon);
    expect(await readFile(manifestFile(), 'utf8')).toBe(MANIFEST);
  });

  it('answers 404 for an unknown room', async () => {
    await expect(words.add('garden', { id: 'chair' })).rejects.toMatchObject({ status: 404 });
  });
});

describe('changing a word', () => {
  it('sets the difficulty', async () => {
    await words.setDifficulty('kitchen', 'sink', 3);
    expect((await readManifest()).objects[0]).toEqual({ id: 'sink', difficulty: 3 });
    await expect(words.setDifficulty('kitchen', 'sink', 0)).rejects.toThrow(/difficulty/);
    await expect(words.setDifficulty('kitchen', 'chair', 1)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('removing a word', () => {
  it('removes it from the room with its masks, and keeps its lexicon entry', async () => {
    for (const name of ['bath-mat.png', 'bath-mat@2.png', 'sink.png']) {
      await writeFile(path.join(masksDir(), name), '');
    }
    expect(await words.remove('kitchen', 'bath-mat')).toEqual({ deletedMasks: 2 });
    expect((await readManifest()).objects).toEqual([{ id: 'sink', difficulty: 1 }]);
    expect(await readdir(masksDir())).toEqual(['sink.png']);
    expect((await readLexicon())['bath-mat']).toBeDefined();
  });

  it('rejects a word not in the room and the last word of a room', async () => {
    await expect(words.remove('kitchen', 'chair')).rejects.toMatchObject({ status: 404 });
    await words.remove('kitchen', 'bath-mat');
    await expect(words.remove('kitchen', 'sink')).rejects.toThrow(/at least one word/);
  });
});
