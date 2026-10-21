import { describe, expect, it } from 'vitest';
import { createLookAndIdentify } from '../../src/core/exercise.js';
import { createRng } from '../../src/core/rng.js';

const OBJECTS = [
  { id: 'refrigerator', label: 'refrigerator', accepted: ['refrigerator', 'fridge'] },
  { id: 'stove', label: 'stove', accepted: ['stove'] },
  { id: 'sink', label: 'sink', accepted: ['sink'] },
  { id: 'table', label: 'table', accepted: ['table'] },
  { id: 'chair', label: 'chair', accepted: ['chair'] },
  { id: 'cup', label: 'cup', accepted: ['cup', 'mug'] },
];

function exercise(options = {}) {
  return createLookAndIdentify({ objects: OBJECTS, rng: createRng(42), ...options });
}

function playAll(ex) {
  const challenges = [];
  for (let c = ex.next(); c; c = ex.next()) {
    challenges.push({ ...c, choices: [...c.choices] });
    ex.answer(c.objectId);
  }
  return challenges;
}

describe('createLookAndIdentify: choices', () => {
  it('offers the target and three distractors by default', () => {
    for (const c of playAll(exercise())) {
      expect(c.choices).toHaveLength(4);
      expect(c.choices).toContain(c.objectId);
      expect(new Set(c.choices).size).toBe(4);
    }
  });

  it('honours a custom number of choices', () => {
    for (const c of playAll(exercise({ choiceCount: 3 }))) expect(c.choices).toHaveLength(3);
  });

  it('takes distractors from the room objects only', () => {
    const ids = new Set(OBJECTS.map((o) => o.id));
    for (const c of playAll(exercise())) for (const id of c.choices) expect(ids.has(id)).toBe(true);
  });

  it('never offers a distractor that shares an accepted spelling with the answer', () => {
    // "mug" is a word of its own here, and an accepted spelling of "cup".
    const objects = [...OBJECTS, { id: 'mug', label: 'mug', accepted: ['mug'] }];
    for (let seed = 0; seed < 50; seed++) {
      const ex = createLookAndIdentify({ objects, rng: createRng(seed), roundLength: 14 });
      for (const c of playAll(ex)) {
        if (c.objectId === 'cup') expect(c.choices).not.toContain('mug');
        if (c.objectId === 'mug') expect(c.choices).not.toContain('cup');
      }
    }
  });

  it('never offers two distractors that share a spelling', () => {
    const objects = [
      ...OBJECTS.filter((o) => o.id !== 'cup'),
      { id: 'cup', label: 'cup', accepted: ['cup', 'mug'] },
      { id: 'mug', label: 'mug', accepted: ['mug'] },
    ];
    for (let seed = 0; seed < 50; seed++) {
      const ex = createLookAndIdentify({ objects, rng: createRng(seed), objectIds: ['stove'] });
      for (const c of playAll(ex)) {
        expect(c.choices.includes('cup') && c.choices.includes('mug')).toBe(false);
      }
    }
  });

  it('shuffles the position of the answer', () => {
    const positions = new Set(playAll(exercise()).map((c) => c.choices.indexOf(c.objectId)));
    expect(positions.size).toBeGreaterThan(1);
  });

  it('varies the distractors between challenges', () => {
    const ex = exercise({ objectIds: ['stove'], roundLength: 10 });
    const sets = new Set(playAll(ex).map((c) => [...c.choices].sort().join()));
    expect(sets.size).toBeGreaterThan(1);
  });

  it('offers fewer choices when the room has fewer words', () => {
    const ex = createLookAndIdentify({ objects: OBJECTS.slice(0, 2), rng: createRng(1) });
    expect(ex.next().choices).toHaveLength(2);
  });

  it('is reproducible with the same seed', () => {
    expect(playAll(exercise())).toEqual(playAll(exercise()));
  });

  it('requires a distractor for every target', () => {
    expect(() =>
      createLookAndIdentify({ objects: OBJECTS.slice(0, 1), rng: createRng(1) }),
    ).toThrow(/no distractor/);
  });

  it('requires at least one eligible object', () => {
    expect(() => exercise({ objectIds: [] })).toThrow();
  });
});

describe('createLookAndIdentify: rounds and answers', () => {
  it('reports its activity', () => {
    expect(exercise().activity).toBe('lookAndIdentify');
  });

  it('plays the configured number of challenges without repeating a target twice in a row', () => {
    const targets = playAll(exercise({ roundLength: 10 })).map((c) => c.objectId);
    expect(targets).toHaveLength(10);
    expect(new Set(targets.slice(0, 6)).size).toBe(6);
    for (let i = 1; i < targets.length; i++) expect(targets[i]).not.toBe(targets[i - 1]);
  });

  it('accepts the target word as correct', () => {
    const ex = exercise();
    const { objectId } = ex.next();
    expect(ex.answer(objectId)).toEqual({
      outcome: 'correct',
      objectId,
      answeredId: objectId,
      done: true,
    });
  });

  it('gives another try after one wrong word, and reveals after two', () => {
    const ex = exercise();
    const { objectId, choices } = ex.next();
    const wrong = choices.filter((id) => id !== objectId);
    expect(ex.answer(wrong[0])).toMatchObject({ outcome: 'tryAgain', done: false });
    expect(ex.answer(wrong[1])).toMatchObject({ outcome: 'reveal', objectId, done: true });
  });
});
