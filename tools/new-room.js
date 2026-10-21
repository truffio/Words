/**
 * new-room — starts a new room: creates content/rooms/<id>/ with a starter manifest
 * marked as a draft, so the unfinished room is checked (with warnings only) but never
 * built or shown in the game until its manifest drops `"draft": true`.
 *
 * Usage: npm run new-room <id> "<Title>"
 *   e.g. npm run new-room living-room "Living room"
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ID_PATTERN = /^[a-z]+(-[a-z]+)*$/;

/**
 * The starter manifest of a new room.
 * @param {string} id
 * @param {string} title
 */
export function starterManifest(id, title) {
  return { id, title, draft: true, objects: [] };
}

/**
 * Checks the command-line arguments.
 * @param {string[]} args
 * @param {string} roomsDir
 * @returns {string[]} problems, empty when the room can be created
 */
export function checkArgs([id, title], roomsDir) {
  if (!id || !title) return ['usage: npm run new-room <id> "<Title>"'];
  const problems = [];
  if (!ID_PATTERN.test(id)) {
    problems.push(`room id "${id}" must be lowercase words joined by "-", e.g. living-room`);
  } else if (existsSync(path.join(roomsDir, id))) {
    problems.push(`room "${id}" already exists in ${path.relative('.', roomsDir)}`);
  }
  if (!title.trim()) problems.push('the title must not be empty');
  return problems;
}

async function main() {
  const roomsDir = path.resolve('content/rooms');
  const args = process.argv.slice(2);
  const problems = checkArgs(args, roomsDir);
  if (problems.length) {
    console.error(`new-room: ${problems.join('\nnew-room: ')}`);
    process.exit(1);
  }

  const [id, title] = args;
  const dir = path.join(roomsDir, id);
  await mkdir(path.join(dir, 'masks'), { recursive: true });
  await writeFile(
    path.join(dir, 'manifest.json'),
    `${JSON.stringify(starterManifest(id, title.trim()), null, 2)}\n`,
  );

  const rel = path.relative('.', dir).replaceAll('\\', '/');
  console.log(`new-room: created ${rel}/manifest.json (draft)

Next steps (docs/art/style-guide.md, section 5):
  1. Add the room's words to content/lexicon.json and list them in the manifest's "objects".
  2. Paint the room and save it as ${rel}/room.png (or load it in the mask tool).
  3. Make one mask per object with the mask tool: npm run masks
  4. Check it: npm run validate:content (a draft's problems are only warnings).
  5. When it is ready, remove "draft": true from the manifest.`);
}

// Run only from the command line, not when imported by tests.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('tools/new-room.js')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
