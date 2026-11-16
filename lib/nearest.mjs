// The name a typo most likely meant, for errors naming an unknown command or
// style. golem's src/error/nearest.rs suggests by the same rule.

/** Levenshtein distance: insertions, deletions and substitutions turning `a` into `b`. */
export function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 0; i < a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i + 1;
    for (let j = 0; j < b.length; j += 1) {
      const above = row[j + 1];
      row[j + 1] = Math.min(diagonal + (a[i] === b[j] ? 0 : 1), row[j] + 1, above + 1);
      diagonal = above;
    }
  }
  return row[b.length];
}

// Most misspellings are one insertion, deletion, substitution or transposition
// (Damerau, CACM 7(3), 1964); a transposition is two edits above.
const TYPO_EDITS = 2;

/** The names in `known` at most two edits from `name` (any case), nearest first, ties alphabetical. */
export function nearest(name, known) {
  const typed = String(name).toLowerCase();
  return known
    .map((candidate) => ({ candidate, edits: distance(typed, candidate.toLowerCase()) }))
    .filter(({ edits }) => edits <= TYPO_EDITS)
    .sort((one, other) => one.edits - other.edits || one.candidate.localeCompare(other.candidate))
    .map(({ candidate }) => candidate);
}
