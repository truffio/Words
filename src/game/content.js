import { buildRoomContent } from '../core/content.js';
import lexicon from '../../content/lexicon.json';

// Room manifests are small, so they are bundled with the game. Validation happens at
// build time in build:rooms.
const manifests = import.meta.glob('../../content/rooms/*/manifest.json', {
  eager: true,
  import: 'default',
});

const rooms = new Map(
  Object.values(manifests).map((manifest) => [manifest.id, buildRoomContent(manifest, lexicon)]),
);

/** IDs of all rooms, in folder order. */
export const roomIds = [...rooms.keys()];

/**
 * @param {string} roomId
 * @returns {import('../core/content.js').RoomContent}
 */
export function getRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) throw new Error(`Unknown room "${roomId}".`);
  return room;
}
