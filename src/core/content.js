/**
 * Runtime view of a room's vocabulary: the room manifest joined with the lexicon.
 * Validation lives in content-validation.js and runs at build time.
 */

/**
 * @typedef {object} RoomObject
 * @property {string} id
 * @property {string} label
 * @property {string} prompt
 * @property {string[]} accepted
 * @property {number} difficulty
 */

/**
 * @typedef {object} RoomContent
 * @property {string} id
 * @property {string} title
 * @property {RoomObject[]} objects
 * @property {Map<string, RoomObject>} byId
 */

/**
 * @param {object} manifest a validated room manifest
 * @param {object} lexicon a validated lexicon
 * @returns {RoomContent}
 */
export function buildRoomContent(manifest, lexicon) {
  const objects = manifest.objects.map(({ id, difficulty = 1 }) => {
    const entry = lexicon[id];
    if (!entry) throw new Error(`Room "${manifest.id}" uses "${id}", which is not in the lexicon.`);
    return { id, label: entry.label, prompt: entry.prompt, accepted: entry.accepted, difficulty };
  });
  return {
    id: manifest.id,
    title: manifest.title,
    objects,
    byId: new Map(objects.map((o) => [o.id, o])),
  };
}
