import { roomAssetsUrl } from './content.js';

/** Files of a room besides the atlas pages, which objects.json lists. */
const ROOM_FILES = ['background.webp', 'layout.json', 'hitmap.bin'];

/**
 * Downloads a room's files into the browser's HTTP cache, at low priority, so that
 * switching to it later is fast. Nothing is decoded or kept in memory. Failures are
 * ignored: the room is simply downloaded when it is opened.
 * @param {string} roomId
 * @returns {Promise<void>}
 */
export async function prefetchRoom(roomId) {
  const base = roomAssetsUrl(roomId);
  // Each body is read to the end, so the whole file reaches the cache.
  const get = (file) =>
    fetch(`${base}/${file}`, { priority: 'low' }).then((response) => response.arrayBuffer());
  try {
    const [atlas] = await Promise.all([get('objects.json'), ...ROOM_FILES.map(get)]);
    const { textures } = JSON.parse(new TextDecoder().decode(atlas));
    await Promise.all(textures.map((t) => get(t.image)));
  } catch {
    // Prefetching is only an optimisation.
  }
}
