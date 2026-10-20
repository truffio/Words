import Ajv from 'ajv';
import lexiconSchema from '../../content/schemas/lexicon.schema.json' with { type: 'json' };
import manifestSchema from '../../content/schemas/room-manifest.schema.json' with { type: 'json' };

/**
 * Build-time validation of vocabulary content (used by tools and tests, not by the
 * game bundle). Each function throws a ContentError listing every problem found.
 */

export class ContentError extends Error {
  /**
   * @param {string} subject what was validated
   * @param {string[]} problems
   */
  constructor(subject, problems) {
    super(`${subject} is invalid:\n- ${problems.join('\n- ')}`);
    this.name = 'ContentError';
    this.problems = problems;
  }
}

const ajv = new Ajv({ allErrors: true });
const checkLexicon = ajv.compile(lexiconSchema);
const checkManifest = ajv.compile(manifestSchema);

function schemaProblems(errors) {
  return errors.map((e) => `${e.instancePath || '(root)'} ${e.message}`);
}

/**
 * @param {unknown} lexicon
 * @returns {object} the lexicon, unchanged
 */
export function validateLexicon(lexicon) {
  if (!checkLexicon(lexicon)) {
    throw new ContentError('Lexicon', schemaProblems(checkLexicon.errors));
  }
  return lexicon;
}

/**
 * Checks a room manifest against its schema and against the lexicon.
 * @param {unknown} manifest
 * @param {object} lexicon a validated lexicon
 * @returns {object} the manifest, unchanged
 */
export function validateManifest(manifest, lexicon) {
  const subject = `Room manifest${manifest?.id ? ` "${manifest.id}"` : ''}`;
  if (!checkManifest(manifest)) {
    throw new ContentError(subject, schemaProblems(checkManifest.errors));
  }

  const problems = [];
  const seen = new Set();
  /** @type {Map<string, string>} accepted spelling → object ID */
  const spellings = new Map();

  for (const { id } of manifest.objects) {
    if (seen.has(id)) problems.push(`object "${id}" is listed more than once`);
    seen.add(id);

    const entry = lexicon[id];
    if (!entry) {
      problems.push(`object "${id}" is not in the lexicon`);
      continue;
    }
    for (const spelling of entry.accepted) {
      const other = spellings.get(spelling);
      if (other && other !== id) {
        problems.push(`"${id}" and "${other}" both accept the spelling "${spelling}"`);
      }
      spellings.set(spelling, id);
    }
  }

  if (problems.length) throw new ContentError(subject, problems);
  return manifest;
}
