/**
 * validate:content — checks all vocabulary and room content without writing any files:
 * lexicon and manifest schemas, IDs, masks (names, sizes, coverage), accepted spellings,
 * audio references, and hit regions (overlaps, minimum tap size).
 *
 * Reports every problem at once and exits with an error if there are any. Warnings
 * (resolved overlaps, small regions, unused files) are listed but do not fail. Draft
 * rooms are checked too, but their problems are only warnings.
 *
 * Usage: node tools/validate-content.js
 */
import path from 'node:path';
import { analyseRoom, loadContent } from './lib/room-content.js';
import { report } from './lib/report.js';

async function main() {
  const { rooms, drafts, draftIds, problems, warnings } = await loadContent({
    contentDir: path.resolve('content'),
    publicDir: path.resolve('public'),
  });
  for (const room of rooms) {
    const analysis = analyseRoom(room);
    problems.push(...analysis.problems);
    warnings.push(...analysis.warnings);
  }
  for (const room of drafts) {
    const analysis = analyseRoom(room);
    warnings.push(...[...analysis.problems, ...analysis.warnings].map((w) => `${w} (draft)`));
  }

  const ok = report('validate:content', { problems, warnings });
  const draftNote = draftIds.length ? `; draft(s) not built: ${draftIds.join(', ')}` : '';
  if (ok) console.log(`validate:content: ${rooms.length} room(s) OK${draftNote}`);
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
