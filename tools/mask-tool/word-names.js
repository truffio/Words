/**
 * Names of new words, shared by the mask tool page and its server (no Node or DOM APIs).
 */

/** The lexicon ID for a label: "Frying pan" → "frying-pan". */
export function idFromLabel(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** An accepted spelling as the lexicon stores it: lowercase words separated by one space. */
export function normaliseSpelling(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
}
