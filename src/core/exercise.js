/**
 * Exercise controllers for the three activities. They share one set of round rules
 * and differ only in what a challenge offers and how an answer is checked:
 *
 * - Listen and find: the game names an object, the child taps it.
 * - Look and identify: an object glows, the child chooses its word among 3–4 choices.
 * - Recall and spell: an object glows, the child types its name.
 *
 * Rules (TECHNICAL.md §4, proposed gameplay rules):
 * - A round has `roundLength` challenges drawn from the eligible objects; by default one
 *   per object, so a round goes through every object of the room once. No object
 *   repeats while unused objects remain, and never twice in a row.
 * - A wrong answer gives another try; after `maxWrongAttempts` wrong answers the
 *   answer is revealed and the challenge ends.
 * - A challenge counts as correct when it ends without a reveal.
 */

export const DEFAULT_MAX_WRONG_ATTEMPTS = 2;
export const DEFAULT_CHOICE_COUNT = 4;

/** @typedef {'listenAndFind' | 'lookAndIdentify' | 'recallAndSpell'} Activity */
/** @typedef {'correct' | 'tryAgain' | 'reveal'} Outcome */

/**
 * @typedef {object} Challenge
 * @property {number} number 1-based position in the round
 * @property {string} objectId the target object
 * @property {number} wrongAttempts
 * @property {boolean} done
 * @property {string[]} [choices] Look and identify: object IDs offered, shuffled
 */

/**
 * @typedef {object} AnswerResult
 * @property {Outcome} outcome
 * @property {string} objectId the target object
 * @property {string} [answeredId] the object the child chose (tap or word button); for a
 *   tap on shared pixels, the target if it was there, otherwise the most specific object
 * @property {string[]} [answeredIds] Listen and find: every object at the tapped point
 * @property {string} [answeredText] the text the child typed (spelling)
 * @property {boolean} done whether the challenge has ended
 */

/**
 * @typedef {object} Exercise
 * @property {Activity} activity
 * @property {number} roundLength
 * @property {Challenge | null} current
 * @property {() => Challenge | null} next
 * @property {(answer: string | string[]) => AnswerResult} answer
 */

/**
 * Normalises a typed answer: trimmed, lowercased, with repeated spaces collapsed.
 * @param {string} text
 */
export function normalizeAnswer(text) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The shared round: selection without repeats, retry and reveal.
 * @param {object} options
 * @param {Activity} options.activity
 * @param {string[]} options.objectIds eligible object IDs (at least one)
 * @param {import('./rng.js').Rng} options.rng
 * @param {number} options.roundLength
 * @param {number} options.maxWrongAttempts
 * @param {(challenge: Challenge, answer: any) => boolean} options.isCorrect
 * @param {(answer: any, challenge: Challenge) => Partial<AnswerResult>} options.describeAnswer
 * @param {(objectId: string) => Partial<Challenge>} [options.extend] extra challenge fields
 * @returns {Exercise}
 */
function createRound({
  activity,
  objectIds,
  rng,
  roundLength,
  maxWrongAttempts,
  isCorrect,
  describeAnswer,
  extend = () => ({}),
}) {
  /** @type {string[]} */
  let bag = [];
  /** @type {string | null} */
  let lastPicked = null;
  /** @type {Challenge | null} */
  let current = null;
  let started = 0;

  function pick() {
    if (bag.length === 0) {
      bag = rng.shuffle(objectIds);
      // Avoid the same object twice in a row across refills.
      if (bag.length > 1 && bag[bag.length - 1] === lastPicked) {
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
    }
    lastPicked = bag.pop();
    return lastPicked;
  }

  return {
    activity,
    roundLength,

    /** The current challenge, or null before the first one and after the round. */
    get current() {
      return current;
    },

    /**
     * Starts the next challenge.
     * @returns {Challenge | null} null when the round is over
     */
    next() {
      if (current && !current.done) {
        throw new Error('The current challenge has not ended yet.');
      }
      if (started >= roundLength) {
        current = null;
        return null;
      }
      started++;
      const objectId = pick();
      current = { number: started, objectId, wrongAttempts: 0, done: false, ...extend(objectId) };
      return current;
    },

    /**
     * Evaluates the child's answer to the current challenge.
     * @param {string | string[]} answer an object ID, the object IDs at a tapped point
     *   (Listen and find), or typed text for spelling
     * @returns {AnswerResult}
     */
    answer(answer) {
      if (!current || current.done) {
        throw new Error('There is no open challenge to answer.');
      }
      /** @type {Outcome} */
      let outcome;
      if (isCorrect(current, answer)) {
        outcome = 'correct';
      } else {
        current.wrongAttempts++;
        outcome = current.wrongAttempts >= maxWrongAttempts ? 'reveal' : 'tryAgain';
      }
      current.done = outcome !== 'tryAgain';
      return {
        outcome,
        objectId: current.objectId,
        ...describeAnswer(answer, current),
        done: current.done,
      };
    },
  };
}

/**
 * Listen and find: the answer is the object the child tapped, or every object at the
 * tapped point when objects share pixels (a stereo system and its speakers), the most
 * specific first. It is right if the target is among them.
 * @param {object} options
 * @param {string[]} options.objectIds eligible object IDs (at least one)
 * @param {import('./rng.js').Rng} options.rng
 * @param {number} [options.roundLength] challenges per round (default: one per object)
 * @param {number} [options.maxWrongAttempts]
 */
export function createListenAndFind({
  objectIds,
  rng,
  roundLength = objectIds.length,
  maxWrongAttempts = DEFAULT_MAX_WRONG_ATTEMPTS,
}) {
  if (objectIds.length === 0) {
    throw new Error('Listen and find needs at least one eligible object.');
  }
  return createRound({
    activity: 'listenAndFind',
    objectIds,
    rng,
    roundLength,
    maxWrongAttempts,
    isCorrect: (challenge, answer) => [answer].flat().includes(challenge.objectId),
    describeAnswer: (answer, challenge) => {
      const answeredIds = [answer].flat();
      const hit = answeredIds.includes(challenge.objectId);
      return { answeredId: hit ? challenge.objectId : answeredIds[0], answeredIds };
    },
  });
}

/**
 * Look and identify: each challenge offers the target's word and distractors from the
 * same room, in shuffled order; the answer is the ID of the chosen word.
 *
 * Distractors never share an accepted spelling with the target (so two buttons can
 * never both be right), are never a whole or a part of the target (with a speaker
 * glowing, "stereo system" would be a wrong answer that is really right), and never
 * repeat a word already offered.
 * @param {object} options
 * @param {{ id: string, label: string, accepted: string[] }[]} options.objects the room's objects
 * @param {[string, string][]} [options.parts] whole/part pairs of object IDs (layout.json)
 * @param {string[]} [options.objectIds] eligible targets (default: all objects)
 * @param {import('./rng.js').Rng} options.rng
 * @param {number} [options.choiceCount] words per challenge, distractors included
 * @param {number} [options.roundLength] challenges per round (default: one per target)
 * @param {number} [options.maxWrongAttempts]
 */
export function createLookAndIdentify({
  objects,
  parts = [],
  objectIds = objects.map((o) => o.id),
  rng,
  choiceCount = DEFAULT_CHOICE_COUNT,
  roundLength = objectIds.length,
  maxWrongAttempts = DEFAULT_MAX_WRONG_ATTEMPTS,
}) {
  if (objectIds.length === 0) {
    throw new Error('Look and identify needs at least one eligible object.');
  }
  const byId = new Map(objects.map((o) => [o.id, o]));
  const spellings = (o) => new Set([o.label, ...o.accepted].map(normalizeAnswer));
  const related = new Set(parts.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));

  /** Distractor candidates for each target, computed once. */
  const candidates = new Map(
    objectIds.map((id) => {
      const target = spellings(byId.get(id));
      const others = objects.filter(
        (o) =>
          o.id !== id &&
          !related.has(`${id}|${o.id}`) &&
          ![...spellings(o)].some((s) => target.has(s)),
      );
      if (others.length === 0) {
        throw new Error(`Look and identify has no distractor for "${id}".`);
      }
      return [id, others];
    }),
  );

  function choicesFor(objectId) {
    const offered = new Set([normalizeAnswer(byId.get(objectId).label)]);
    const distractors = [];
    for (const o of rng.shuffle(candidates.get(objectId))) {
      if (distractors.length >= choiceCount - 1) break;
      const words = spellings(o);
      if ([...words].some((w) => offered.has(w))) continue;
      words.forEach((w) => offered.add(w));
      distractors.push(o.id);
    }
    return rng.shuffle([objectId, ...distractors]);
  }

  return createRound({
    activity: 'lookAndIdentify',
    objectIds,
    rng,
    roundLength,
    maxWrongAttempts,
    isCorrect: (challenge, answeredId) => answeredId === challenge.objectId,
    describeAnswer: (answeredId) => ({ answeredId }),
    extend: (objectId) => ({ choices: choicesFor(objectId) }),
  });
}

/**
 * Recall and spell: the answer is typed text, normalised and compared against the
 * target's accepted spellings (e.g. "fridge" for refrigerator). No typo tolerance.
 * @param {object} options
 * @param {{ id: string, label: string, accepted: string[] }[]} options.objects the room's objects
 * @param {string[]} [options.objectIds] eligible targets (default: all objects)
 * @param {import('./rng.js').Rng} options.rng
 * @param {number} [options.roundLength] challenges per round (default: one per target)
 * @param {number} [options.maxWrongAttempts]
 */
export function createRecallAndSpell({
  objects,
  objectIds = objects.map((o) => o.id),
  rng,
  roundLength = objectIds.length,
  maxWrongAttempts = DEFAULT_MAX_WRONG_ATTEMPTS,
}) {
  if (objectIds.length === 0) {
    throw new Error('Recall and spell needs at least one eligible object.');
  }
  const accepted = new Map(
    objects.map((o) => [o.id, new Set([o.label, ...o.accepted].map(normalizeAnswer))]),
  );

  return createRound({
    activity: 'recallAndSpell',
    objectIds,
    rng,
    roundLength,
    maxWrongAttempts,
    isCorrect: (challenge, text) => accepted.get(challenge.objectId).has(normalizeAnswer(text)),
    describeAnswer: (text) => ({ answeredText: text }),
  });
}
