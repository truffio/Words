import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRoomContent } from '../../src/core/content.js';
import { validateLexicon, validateManifest } from '../../src/core/content-validation.js';

const readJson = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const lexicon = readJson('../../content/lexicon.json');
const kitchen = readJson('../../content/rooms/kitchen/manifest.json');

const entry = (label) => ({ label, prompt: `Find the ${label}.`, accepted: [label] });

describe('kitchen content', () => {
  it('passes validation', () => {
    expect(() => validateLexicon(lexicon)).not.toThrow();
    expect(() => validateManifest(kitchen, lexicon)).not.toThrow();
  });

  it('joins the manifest with the lexicon', () => {
    const room = buildRoomContent(kitchen, lexicon);
    expect(room.id).toBe('kitchen');
    expect(room.title).toBe('Kitchen');
    expect(room.objects).toHaveLength(kitchen.objects.length);
    expect(room.byId.get('refrigerator')).toEqual({
      id: 'refrigerator',
      label: 'refrigerator',
      prompt: 'Find the refrigerator.',
      accepted: ['refrigerator', 'fridge'],
      difficulty: 1,
    });
  });
});

describe('validateLexicon', () => {
  it('rejects invalid IDs, missing fields, and badly formed spellings', () => {
    const bad = {
      Stove: entry('stove'),
      sink: { label: 'sink', accepted: ['sink'] },
      cup: { ...entry('cup'), accepted: ['Cup'] },
    };
    let error;
    try {
      validateLexicon(bad);
    } catch (e) {
      error = e;
    }
    expect(error?.name).toBe('ContentError');
    expect(error.problems.join('\n')).toMatch(/property name/);
    expect(error.problems.join('\n')).toMatch(/prompt/);
    expect(error.problems.join('\n')).toMatch(/pattern/);
  });
});

describe('validateManifest', () => {
  const small = { stove: entry('stove'), cup: { ...entry('cup'), accepted: ['cup', 'mug'] } };

  it('accepts a valid manifest', () => {
    expect(() =>
      validateManifest({ id: 'kitchen', title: 'Kitchen', objects: [{ id: 'stove' }] }, small),
    ).not.toThrow();
  });

  it('rejects schema errors', () => {
    expect(() => validateManifest({ id: 'kitchen', objects: [] }, small)).toThrow(/title/);
    expect(() =>
      validateManifest({ id: 'k', title: 'K', objects: [{ id: 'stove', difficulty: 5 }] }, small),
    ).toThrow(/<= 3/);
  });

  it('rejects unknown and duplicated objects', () => {
    const manifest = {
      id: 'k',
      title: 'K',
      objects: [{ id: 'stove' }, { id: 'stove' }, { id: 'oven' }],
    };
    expect(() => validateManifest(manifest, small)).toThrow(
      /more than once[\s\S]*not in the lexicon/,
    );
  });

  it('rejects two objects in a room that accept the same spelling', () => {
    const lex = { ...small, mug: entry('mug') };
    const manifest = { id: 'k', title: 'K', objects: [{ id: 'cup' }, { id: 'mug' }] };
    expect(() => validateManifest(manifest, lex)).toThrow(/both accept the spelling "mug"/);
  });
});
