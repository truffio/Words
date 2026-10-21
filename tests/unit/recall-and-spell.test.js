import { describe, expect, it } from 'vitest';
import { createRecallAndSpell, normalizeAnswer } from '../../src/core/exercise.js';
import { createRng } from '../../src/core/rng.js';

const OBJECTS = [
  { id: 'refrigerator', label: 'refrigerator', accepted: ['refrigerator', 'fridge'] },
  { id: 'stove', label: 'stove', accepted: ['stove'] },
  { id: 'teddy_bear', label: 'teddy bear', accepted: ['teddy bear', 'teddy'] },
];

/** An exercise whose every challenge targets `objectId`. */
function exerciseFor(objectId, options = {}) {
  const ex = createRecallAndSpell({
    objects: OBJECTS,
    objectIds: [objectId],
    rng: createRng(1),
    ...options,
  });
  ex.next();
  return ex;
}

describe('normalizeAnswer', () => {
  it('trims, lowercases, and collapses repeated spaces', () => {
    expect(normalizeAnswer('  Fridge ')).toBe('fridge');
    expect(normalizeAnswer('TEDDY    bear')).toBe('teddy bear');
    expect(normalizeAnswer('\tteddy \n bear\n')).toBe('teddy bear');
    expect(normalizeAnswer('')).toBe('');
  });

  it('keeps letters and punctuation otherwise unchanged', () => {
    expect(normalizeAnswer('Stove!')).toBe('stove!');
    expect(normalizeAnswer('teddybear')).toBe('teddybear');
  });
});

describe('createRecallAndSpell', () => {
  it('reports its activity', () => {
    expect(exerciseFor('stove').activity).toBe('recallAndSpell');
  });

  it('accepts the exact spelling', () => {
    expect(exerciseFor('stove').answer('stove')).toEqual({
      outcome: 'correct',
      objectId: 'stove',
      answeredText: 'stove',
      done: true,
    });
  });

  it('accepts an accepted variant', () => {
    expect(exerciseFor('refrigerator').answer('fridge').outcome).toBe('correct');
  });

  it('ignores case and surrounding or repeated spaces', () => {
    expect(exerciseFor('refrigerator').answer('  Refrigerator ').outcome).toBe('correct');
    expect(exerciseFor('teddy_bear').answer('Teddy   Bear').outcome).toBe('correct');
  });

  it('checks multi-word labels word by word', () => {
    expect(exerciseFor('teddy_bear').answer('teddy bear').outcome).toBe('correct');
    expect(exerciseFor('teddy_bear').answer('teddybear').outcome).toBe('tryAgain');
    expect(exerciseFor('teddy_bear').answer('bear').outcome).toBe('tryAgain');
  });

  it('accepts the label even when it is missing from the accepted list', () => {
    const ex = createRecallAndSpell({
      objects: [{ id: 'sink', label: 'sink', accepted: [] }],
      rng: createRng(1),
    });
    ex.next();
    expect(ex.answer('sink').outcome).toBe('correct');
  });

  it('has no typo tolerance', () => {
    expect(exerciseFor('refrigerator').answer('refridgerator').outcome).toBe('tryAgain');
    expect(exerciseFor('stove').answer('stov').outcome).toBe('tryAgain');
  });

  it("does not accept another object's spelling", () => {
    expect(exerciseFor('stove').answer('fridge').outcome).toBe('tryAgain');
  });

  it('gives another try after a wrong spelling, and reveals after two', () => {
    const ex = exerciseFor('refrigerator');
    expect(ex.answer('frige')).toMatchObject({ outcome: 'tryAgain', done: false });
    expect(ex.current.wrongAttempts).toBe(1);
    expect(ex.answer('fridg')).toMatchObject({
      outcome: 'reveal',
      objectId: 'refrigerator',
      answeredText: 'fridg',
      done: true,
    });
  });

  it('can still be answered correctly on the second try', () => {
    const ex = exerciseFor('stove');
    ex.answer('stuv');
    expect(ex.answer('stove').outcome).toBe('correct');
  });

  it('plays a round of the configured length with no target twice in a row', () => {
    const ex = createRecallAndSpell({ objects: OBJECTS, rng: createRng(7), roundLength: 9 });
    const targets = [];
    for (let c = ex.next(); c; c = ex.next()) {
      targets.push(c.objectId);
      ex.answer(OBJECTS.find((o) => o.id === c.objectId).label);
    }
    expect(targets).toHaveLength(9);
    for (let i = 1; i < targets.length; i++) expect(targets[i]).not.toBe(targets[i - 1]);
  });

  it('requires at least one eligible object', () => {
    expect(() =>
      createRecallAndSpell({ objects: OBJECTS, objectIds: [], rng: createRng(1) }),
    ).toThrow();
  });
});
