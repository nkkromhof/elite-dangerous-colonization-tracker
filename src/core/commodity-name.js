/**
 * Normalize an ED commodity name for consistent matching.
 * Prefers the localised name when available; falls back to stripping
 * the internal $name; format and capitalising the first letter.
 *
 * @param {string|undefined} localised  e.g. "Polymers"
 * @param {string|undefined} internal   e.g. "$polymers;" or "polymers"
 * @returns {string}
 */
export function commodityName(localised, internal) {
  if (localised) return localised;
  if (!internal) return '';
  const stripped = internal.replace(/^\$/, '').replace(/;$/, '');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/**
 * Re-normalise a name that was previously stored (may be lowercase, may have
 * $…; decorators from an older version of the code).
 *
 * @param {string} stored  e.g. "steel", "$polymers;", "Ceramic Composites"
 * @returns {string}
 */
export function normalizeSavedName(stored) {
  if (!stored) return '';
  const stripped = stored.replace(/^\$/, '').replace(/;$/, '');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}
