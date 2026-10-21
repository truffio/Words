/**
 * Prints problems, warnings, and notes from a content tool. Notes are information only
 * (e.g. objects that share pixels).
 * @param {string} tool
 * @param {{ problems: string[], warnings: string[], notes?: string[] }} result
 * @returns {boolean} true when there are no problems
 */
export function report(tool, { problems, warnings, notes = [] }) {
  for (const note of notes) console.log(`${tool}: note: ${note}`);
  for (const warning of warnings) console.warn(`${tool}: warning: ${warning}`);
  if (problems.length) {
    console.error(`${tool} failed with ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`- ${problem}`);
  }
  return problems.length === 0;
}
