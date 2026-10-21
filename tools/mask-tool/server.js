/**
 * Dev-server API for the mask tool (Vite plugin, `vite dev` only). Lists rooms and
 * saves, renames, and deletes masks in content/rooms/<room>/masks/.
 *
 *   GET    /__mask-tool/rooms
 *   GET    /__mask-tool/rooms/<room>/painting              room.png
 *   PUT    /__mask-tool/rooms/<room>/painting[?clearMasks=1]  body: any image; resized
 *                                                          (and cropped to 4:3) to room.png
 *   GET    /__mask-tool/rooms/<room>/masks/<name>          mask PNG
 *   PUT    /__mask-tool/rooms/<room>/masks/<name>          body: PNG
 *   POST   /__mask-tool/rooms/<room>/masks/<name>/rename?to=<new name>
 *   DELETE /__mask-tool/rooms/<room>/masks/<name>
 *
 * Every name is checked against the naming convention and the room's manifest, so the
 * tool can only write well-formed masks inside the content folder.
 */
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../../src/core/display.js';
import { parseMaskName } from '../lib/room-build.js';
import { normalisePainting } from './painting.js';

const ROOM_ID = /^[a-z]+(?:-[a-z]+)*$/;
const MAX_MASK = 20 * 1024 * 1024;
const MAX_PAINTING = 60 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'The file is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** @param {string} contentDir */
function createApi(contentDir) {
  const roomsDir = path.join(contentDir, 'rooms');

  async function manifestOf(roomId) {
    if (!ROOM_ID.test(roomId)) throw new HttpError(400, `Invalid room "${roomId}".`);
    try {
      return await readJson(path.join(roomsDir, roomId, 'manifest.json'));
    } catch {
      throw new HttpError(404, `Room "${roomId}" not found.`);
    }
  }

  async function checkName(roomId, name) {
    const manifest = await manifestOf(roomId);
    const parsed = parseMaskName(name);
    if (!parsed) throw new HttpError(400, `"${name}" is not a valid mask name.`);
    if (!manifest.objects.some((o) => o.id === parsed.objectId)) {
      throw new HttpError(400, `"${parsed.objectId}" is not in the ${roomId} manifest.`);
    }
    return path.join(roomsDir, roomId, 'masks', `${name}.png`);
  }

  async function listMasks(roomId) {
    try {
      return (await readdir(path.join(roomsDir, roomId, 'masks')))
        .filter((f) => f.endsWith('.png'))
        .map((f) => f.slice(0, -4))
        .sort();
    } catch {
      return [];
    }
  }

  return {
    async rooms() {
      const lexicon = await readJson(path.join(contentDir, 'lexicon.json'));
      const ids = (await readdir(roomsDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory() && ROOM_ID.test(e.name))
        .map((e) => e.name)
        .sort();
      return Promise.all(
        ids.map(async (id) => {
          const manifest = await manifestOf(id);
          return {
            id,
            title: manifest.title,
            objects: manifest.objects.map((o) => ({
              id: o.id,
              label: lexicon[o.id]?.label ?? o.id,
            })),
            masks: await listMasks(id),
          };
        }),
      );
    },

    async save(roomId, name, png) {
      const file = await checkName(roomId, name);
      let meta;
      try {
        meta = await sharp(png).metadata();
      } catch {
        throw new HttpError(400, 'The mask is not a valid image.');
      }
      if (meta.width !== LOGICAL_WIDTH || meta.height !== LOGICAL_HEIGHT) {
        throw new HttpError(400, `Masks must be ${LOGICAL_WIDTH} × ${LOGICAL_HEIGHT}.`);
      }
      await mkdir(path.dirname(file), { recursive: true });
      const out = await sharp(png)
        .greyscale()
        .threshold(128)
        .png({ palette: true, colours: 2 })
        .toBuffer();
      await writeFile(file, out);
    },

    async rename(roomId, from, to) {
      const source = await checkName(roomId, from);
      const target = await checkName(roomId, to);
      if (parseMaskName(from).objectId !== parseMaskName(to).objectId) {
        throw new HttpError(
          400,
          'A mask can only be renamed to another instance of the same object.',
        );
      }
      if ((await listMasks(roomId)).includes(to))
        throw new HttpError(409, `"${to}" already exists.`);
      await rename(source, target);
    },

    async remove(roomId, name) {
      await rm(await checkName(roomId, name), { force: true });
    },

    // Served here rather than as static files: Vite's dev server does not serve file
    // names containing "@" (e.g. chair@1.png).
    async painting(roomId) {
      await manifestOf(roomId);
      try {
        return await readFile(path.join(roomsDir, roomId, 'room.png'));
      } catch {
        throw new HttpError(404, `Room "${roomId}" has no painting yet.`);
      }
    },

    /** Replaces the room's painting with any image, optionally deleting its masks. */
    async replacePainting(roomId, image, clearMasks) {
      await manifestOf(roomId);
      let result;
      try {
        result = await normalisePainting(image);
      } catch {
        throw new HttpError(400, 'The file is not an image that can be read.');
      }
      await writeFile(path.join(roomsDir, roomId, 'room.png'), result.png);
      let deleted = 0;
      if (clearMasks) {
        for (const name of await listMasks(roomId)) {
          await rm(path.join(roomsDir, roomId, 'masks', `${name}.png`), { force: true });
          deleted++;
        }
      }
      return { original: result.original, cropped: result.cropped, deletedMasks: deleted };
    },

    async mask(roomId, name) {
      try {
        return await readFile(await checkName(roomId, name));
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(404, `No mask "${name}".`);
      }
    },
  };
}

/**
 * @param {{ contentDir?: string }} [options]
 * @returns {import('vite').Plugin}
 */
export function maskToolServer({ contentDir = path.resolve('content') } = {}) {
  const api = createApi(contentDir);

  return {
    name: 'words-mask-tool',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__mask-tool', async (req, res) => {
        const send = (status, body) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        try {
          const url = new URL(req.url, 'http://localhost');
          const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

          const sendPng = (png) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'no-store');
            res.end(png);
          };

          if (req.method === 'GET' && parts.length === 1 && parts[0] === 'rooms') {
            return send(200, await api.rooms());
          }
          if (parts[0] === 'rooms' && parts[2] === 'painting' && parts.length === 3) {
            if (req.method === 'GET') return sendPng(await api.painting(parts[1]));
            if (req.method === 'PUT') {
              const image = await readBody(req, MAX_PAINTING);
              const clearMasks = url.searchParams.get('clearMasks') === '1';
              return send(200, await api.replacePainting(parts[1], image, clearMasks));
            }
          }
          if (parts[0] === 'rooms' && parts[2] === 'masks' && parts.length >= 4) {
            const [, roomId, , name, action] = parts;
            if (req.method === 'GET' && !action) return sendPng(await api.mask(roomId, name));
            if (req.method === 'PUT' && !action) {
              await api.save(roomId, name, await readBody(req, MAX_MASK));
              return send(200, { saved: name });
            }
            if (req.method === 'POST' && action === 'rename') {
              await api.rename(roomId, name, url.searchParams.get('to') ?? '');
              return send(200, { renamed: name });
            }
            if (req.method === 'DELETE' && !action) {
              await api.remove(roomId, name);
              return send(200, { deleted: name });
            }
          }
          send(404, { error: 'Not found.' });
        } catch (error) {
          send(error.status ?? 500, { error: error.message });
        }
      });
    },
  };
}
