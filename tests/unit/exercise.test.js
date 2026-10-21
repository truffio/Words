import { describe, expect, it } from 'vitest';
import { createListenAndFind } from '../../src/core/exercise.js';
import { createRng } from '../../src/core/rng.js';

const OBJECTS = ['stove', 'sink', 'table', 'chair'];

function exercise(options = {}) {
  return createListenAndFind({ objectIds: OBJECTS, rng: createRng(42), ...options });
}

function playAll(ex) {
  const targets = [];
  for (let c = ex.next(); c; c = ex.next()) {
    targets.push(c.objectId);
    ex.answer(c.objectId);
  }
  return targets;
}

describe('createListenAndFind: selection', () => {
  it('plays the configured number of challenges, then ends', () => {
    const ex = exercise({ roundLength: 10 });
    expect(playAll(ex)).toHaveLength(10);
    expect(ex.next()).toBeNull();
    expect(ex.current).toBeNull();
  });

  it('asks for every object once by default', () => {
    const ex = exercise();
    expect(ex.roundLength).toBe(OBJECTS.length);
    expect(new Set(playAll(ex))).toEqual(new Set(OBJECTS));
    expect(ex.next()).toBeNull();
  });

  it('uses every object once before repeating any', () => {
    const targets = playAll(exercise({ roundLength: 8 }));
    expect(new Set(targets.slice(0, 4))).toEqual(new Set(OBJECTS));
    expect(new Set(targets.slice(4, 8))).toEqual(new Set(OBJECTS));
  });

  it('never asks for the same object twice in a row', () => {
    for (let seed = 0; seed < 50; seed++) {
      const targets = playAll(exercise({ rng: createRng(seed), roundLength: 12 }));
      for (let i = 1; i < targets.length; i++) expect(targets[i]).not.toBe(targets[i - 1]);
    }
  });

  it('is reproducible with the same seed', () => {
    expect(playAll(exercise())).toEqual(playAll(exercise()));
  });

  it('numbers challenges from 1', () => {
    const ex = exercise();
    expect(ex.next().number).toBe(1);
    ex.answer(ex.current.objectId);
    expect(ex.next().number).toBe(2);
  });

  it('works with a single object', () => {
    const ex = createListenAndFind({ objectIds: ['cup'], rng: createRng(1), roundLength: 3 });
    expect(playAll(ex)).toEqual(['cup', 'cup', 'cup']);
  });

  it('requires at least one object', () => {
    expect(() => createListenAndFind({ objectIds: [], rng: createRng(1) })).toThrow();
  });
});

describe('createListenAndFind: answers', () => {
  it('accepts the target object as correct and ends the challenge', () => {
    const ex = exercise();
    const { objectId } = ex.next();
    expect(ex.answer(objectId)).toEqual({
      outcome: 'correct',
      objectId,
      answeredId: objectId,
      answeredIds: [objectId],
      done: true,
    });
  });

  it('accepts a tap on shared pixels when the target is among the objects there', () => {
    const ex = exercise();
    const { objectId } = ex.next();
    const part = OBJECTS.find((o) => o !== objectId);
    // The tap found a part first (the most specific), then the target, its whole.
    expect(ex.answer([part, objectId])).toEqual({
      outcome: 'correct',
      objectId,
      answeredId: objectId,
      answeredIds: [part, objectId],
      done: true,
    });
  });

  it('counts a tap on shared pixels as the most specific object when it is wrong', () => {
    const ex = exercise();
    const { objectId } = ex.next();
    const [part, whole] = OBJECTS.filter((o) => o !== objectId);
    expect(ex.answer([part, whole])).toMatchObject({
      outcome: 'tryAgain',
      answeredId: part,
      answeredIds: [part, whole],
    });
  });

  it('gives another try after one wrong answer', () => {
    const ex = exercise();
    const { objectId } = ex.next();
    const wrong = OBJECTS.find((o) => o !== objectId);
    const result = ex.answer(wrong);
    expect(result).toMatchObject({ outcome: 'tryAgain', done: false, answeredId: wrong });
    expect(ex.current.wrongAttempts).toBe(1);
    expect(ex.answer(objectId).outcome).toBe('correct');
  });

  it('reveals the answer after two wrong answers', () => {
    const ex = exercise();
    const { objectId } = ex.next();
    const wrong = OBJECTS.find((o) => o !== objectId);
    ex.answer(wrong);
    expect(ex.answer(wrong)).toMatchObject({ outcome: 'reveal', objectId, done: true });
  });

  it('honours a custom number of attempts before reveal', () => {
    const ex = exercise({ maxWrongAttempts: 3 });
    const { objectId } = ex.next();
    const wrong = OBJECTS.find((o) => o !== objectId);
    expect(ex.answer(wrong).outcome).toBe('tryAgain');
    expect(ex.answer(wrong).outcome).toBe('tryAgain');
    expect(ex.answer(wrong).outcome).toBe('reveal');
  });

  it('rejects answers when no challenge is open', () => {
    const ex = exercise();
    expect(() => ex.answer('stove')).toThrow();
    const { objectId } = ex.next();
    ex.answer(objectId);
    expect(() => ex.answer(objectId)).toThrow();
  });

  it('does not move on while a challenge is still open', () => {
    const ex = exercise();
    ex.next();
    expect(() => ex.next()).toThrow();
  });
});
