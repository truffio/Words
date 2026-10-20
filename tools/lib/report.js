/**
 * Prints problems and warnings from a content tool.
 * @param {string} tool
 * @param {{ problems: string[], warnings: string[] }} result
 * @returns {boolean} true when there are no problems
 */
export function report(tool, { problems, warnings }) {
  for (const warning of warnings) console.warn(`${tool}: warning: ${warning}`);
  if (problems.length) {
    console.error(`${tool} failed with ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`- ${problem}`);
  }
  return problems.length === 0;
}
