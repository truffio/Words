/**
 * A room's words, edited from the mask tool: adds a word to a room (reusing its lexicon
 * entry, or creating one), changes a word's difficulty, and removes a word from a room
 * with its masks. Every change is checked against the lexicon and manifest schemas, and
 * the room rules of validate:content, before anything is written; files keep their
 * formatting (Prettier, one object per line in manifests).
 */
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as prettier from 'prettier';
import {
  ContentError,
  validateLexicon,
  validateManifest,
} from '../../src/core/content-validation.js';
import { parseMaskName } from '../lib/room-build.js';
import { idFromLabel, normaliseSpelling } from './word-names.js';

const ID_PATTERN = /^[a-z]+(?:-[a-z]+)*$/;
const DEFAULT_DIFFICULTY = 2;

/** A change that cannot be made; `status` is the HTTP status the server answers with. */
export class WordError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** A manifest as text: one object per line, as the room manifests are written by hand. */
export function manifestText(manifest) {
  const { objects, ...rest } = manifest;
  const head = Object.entries(rest).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  const lines = objects.map(
    (o) =>
      `    { ${Object.entries(o)
        .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
        .join(', ')} }`,
  );
  return `{\n${[...head, `  "objects": [\n${lines.join(',\n')}\n  ]`].join(',\n')}\n}\n`;
}

/** Runs a validator, turning its ContentError into a WordError. */
function check(fn) {
  try {
    fn();
  } catch (error) {
    if (!(error instanceof ContentError)) throw error;
    throw new WordError(error.problems.join('; '));
  }
}

function checkDifficulty(difficulty) {
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 3) {
    throw new WordError('The difficulty must be 1, 2, or 3.');
  }
}

/** @param {string} contentDir */
export function createWords(contentDir) {
  const lexiconFile = path.join(contentDir, 'lexicon.json');
  const roomDir = (roomId) => path.join(contentDir, 'rooms', roomId);
  const manifestFile = (roomId) => path.join(roomDir(roomId), 'manifest.json');

  async function readJson(file) {
    return JSON.parse(await readFile(file, 'utf8'));
  }

  async function readManifest(roomId) {
    if (!ID_PATTERN.test(roomId)) throw new WordError(`Invalid room "${roomId}".`);
    try {
      return await readJson(manifestFile(roomId));
    } catch {
      throw new WordError(`Room "${roomId}" not found.`, 404);
    }
  }

  /** Writes text formatted by the project's Prettier settings for that file. */
  async function writeFormatted(file, text) {
    const config = (await prettier.resolveConfig(file)) ?? {};
    await writeFile(file, await prettier.format(text, { ...config, filepath: file }));
  }

  /** The room's mask files for one object: <id>.png and <id>@<n>.png. */
  async function masksOf(roomId, objectId) {
    let files;
    try {
      files = await readdir(path.join(roomDir(roomId), 'masks'));
    } catch {
      return [];
    }
    return files.filter(
      (f) => f.endsWith('.png') && parseMaskName(f.slice(0, -4))?.objectId === objectId,
    );
  }

  return {
    /** The whole lexicon, for suggesting existing words. */
    async lexicon() {
      return readJson(lexiconFile);
    },

    /**
     * Adds a word to a room. A word already in the lexicon is reused as it is (only `id`
     * and `difficulty` count); otherwise a new lexicon entry is made from `label`,
     * `prompt`, and `accepted`.
     * @param {string} roomId
     * @param {{ id?: string, label?: string, prompt?: string, accepted?: string[],
     *   difficulty?: number }} word
     * @returns {Promise<{ id: string, reused: boolean }>}
     */
    async add(roomId, word) {
      const manifest = await readManifest(roomId);
      const lexicon = await readJson(lexiconFile);
      // Labels are lowercase, like every word in the lexicon ("teddy bear").
      const label = (word.label ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
      const id = (word.id ?? '').trim() || idFromLabel(label);
      const difficulty = word.difficulty ?? DEFAULT_DIFFICULTY;

      if (!ID_PATTERN.test(id)) {
        throw new WordError(`"${id}" is not a valid ID: lowercase words joined by "-".`);
      }
      checkDifficulty(difficulty);
      if (manifest.objects.some((o) => o.id === id)) {
        throw new WordError(`"${id}" is already in this room.`, 409);
      }

      const reused = id in lexicon;
      if (!reused) {
        if (!label) throw new WordError('A new word needs a label.');
        const accepted = [
          ...new Set([label, ...(word.accepted ?? [])].map(normaliseSpelling).filter(Boolean)),
        ];
        lexicon[id] = {
          label,
          prompt: (word.prompt ?? '').trim() || `Find the ${label}.`,
          accepted,
        };
        check(() => validateLexicon(lexicon));
      }
      manifest.objects.push({ id, difficulty });
      check(() => validateManifest(manifest, lexicon));

      if (!reused) await writeFormatted(lexiconFile, JSON.stringify(lexicon, null, 2));
      await writeFormatted(manifestFile(roomId), manifestText(manifest));
      return { id, reused };
    },

    /** Changes a word's difficulty in a room. */
    async setDifficulty(roomId, id, difficulty) {
      const manifest = await readManifest(roomId);
      const object = manifest.objects.find((o) => o.id === id);
      if (!object) throw new WordError(`"${id}" is not in this room.`, 404);
      checkDifficulty(difficulty);
      object.difficulty = difficulty;
      const lexicon = await readJson(lexiconFile);
      check(() => validateManifest(manifest, lexicon));
      await writeFormatted(manifestFile(roomId), manifestText(manifest));
    },

    /**
     * Removes a word from a room and deletes its masks. Its lexicon entry stays: other
     * rooms may share it.
     * @returns {Promise<{ deletedMasks: number }>}
     */
    async remove(roomId, id) {
      const manifest = await readManifest(roomId);
      const objects = manifest.objects.filter((o) => o.id !== id);
      if (objects.length === manifest.objects.length) {
        throw new WordError(`"${id}" is not in this room.`, 404);
      }
      if (!objects.length) throw new WordError('A room needs at least one word.');
      manifest.objects = objects;
      const lexicon = await readJson(lexiconFile);
      check(() => validateManifest(manifest, lexicon));
      await writeFormatted(manifestFile(roomId), manifestText(manifest));
      const masks = await masksOf(roomId, id);
      for (const file of masks)
        await rm(path.join(roomDir(roomId), 'masks', file), { force: true });
      return { deletedMasks: masks.length };
    },
  };
}
