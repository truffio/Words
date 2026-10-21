import { describe, expect, it } from 'vitest';
import { createListenAndFind, createRecallAndSpell } from '../../src/core/exercise.js';
import { createRng } from '../../src/core/rng.js';
import { createSession } from '../../src/core/session.js';

const OBJECTS = ['stove', 'sink', 'table'];

function setup() {
  let time = 1000;
  const clock = {
    now: () => time,
    advance: (ms) => (time += ms),
  };
  const exercise = createListenAndFind({ objectIds: OBJECTS, rng: createRng(5), roundLength: 4 });
  const session = createSession({ roomId: 'kitchen', exercise, now: clock.now });
  const events = [];
  for (const name of ['challengeStarted', 'answerEvaluated', 'roundEnded']) {
    session.on(name, (payload) => events.push({ name, ...payload }));
  }
  return { session, events, clock };
}

const wrongFor = (id) => OBJECTS.find((o) => o !== id);

describe('createSession', () => {
  it('starts with the first challenge and an empty score', () => {
    const { session, events } = setup();
    session.start();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('challengeStarted');
    expect(events[0].challenge.number).toBe(1);
    expect(events[0].score).toMatchObject({ correct: 0, attempted: 0 });
    expect(session.awaitingAnswer).toBe(true);
  });

  it('counts a challenge as attempted only when it ends', () => {
    const { session } = setup();
    session.start();
    const target = session.challenge.objectId;

    session.answer(wrongFor(target));
    expect(session.score()).toMatchObject({ correct: 0, attempted: 0 });
    expect(session.awaitingAnswer).toBe(true);

    session.answer(target);
    expect(session.score()).toMatchObject({ correct: 1, attempted: 1 });
    expect(session.awaitingAnswer).toBe(false);
  });

  it('counts a revealed challenge as attempted but not correct', () => {
    const { session } = setup();
    session.start();
    const wrong = wrongFor(session.challenge.objectId);
    session.answer(wrong);
    session.answer(wrong);
    expect(session.score()).toMatchObject({ correct: 0, attempted: 1 });
  });

  it('emits answerEvaluated with the result and updated score', () => {
    const { session, events } = setup();
    session.start();
    session.answer(session.challenge.objectId);
    const last = events.at(-1);
    expect(last.name).toBe('answerEvaluated');
    expect(last.result.outcome).toBe('correct');
    expect(last.score).toMatchObject({ correct: 1, attempted: 1 });
  });

  it('simulates a full round and reports the final score and time', () => {
    const { session, events, clock } = setup();
    session.start();
    let n = 0;
    while (!session.roundOver) {
      clock.advance(3000);
      const target = session.challenge.objectId;
      if (n === 1) {
        session.answer(wrongFor(target));
        session.answer(wrongFor(target));
      } else {
        session.answer(target);
      }
      session.next();
      n++;
    }

    expect(n).toBe(4);
    const end = events.at(-1);
    expect(end.name).toBe('roundEnded');
    expect(end.score).toEqual({ correct: 3, attempted: 4, elapsedMs: 12000 });
    expect(events.filter((e) => e.name === 'challengeStarted')).toHaveLength(4);

    // Time stops when the round ends.
    clock.advance(5000);
    expect(session.score().elapsedMs).toBe(12000);
    expect(session.awaitingAnswer).toBe(false);
  });

  it('cannot be started twice', () => {
    const { session } = setup();
    session.start();
    expect(() => session.start()).toThrow();
  });

  it('stops notifying a listener after unsubscribe', () => {
    const { session } = setup();
    const seen = [];
    const off = session.on('challengeStarted', (e) => seen.push(e));
    off();
    session.start();
    expect(seen).toHaveLength(0);
  });
});

describe('createSession with typed answers', () => {
  it('passes the answer through to the exercise and reports its activity', () => {
    const exercise = createRecallAndSpell({
      objects: [{ id: 'stove', label: 'stove', accepted: ['stove'] }],
      rng: createRng(1),
      roundLength: 1,
    });
    const session = createSession({ roomId: 'kitchen', exercise });
    expect(session.activity).toBe('recallAndSpell');
    session.start();
    expect(session.answer(' Stove ').outcome).toBe('correct');
    expect(session.score()).toMatchObject({ correct: 1, attempted: 1 });
  });
});
