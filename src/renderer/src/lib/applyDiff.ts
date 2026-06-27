import { applyPatch, parsePatch } from 'diff'

/**
 * Apply a unified diff to source text, with fuzzy matching as a fallback.
 *
 * Returns the patched text or null if the patch can't be applied. The `diff`
 * library's applyPatch is already tolerant of some drift via `fuzzFactor`; we
 * raise it before giving up.
 */
export function applyUnifiedDiff(source: string, unifiedDiff: string): string | null {
  // try strict first
  const strict = applyPatch(source, unifiedDiff, { fuzzFactor: 0 })
  if (strict !== false) return strict

  // try with fuzz — allow context lines to be off by a few
  for (const fuzz of [1, 2, 3, 4]) {
    const result = applyPatch(source, unifiedDiff, { fuzzFactor: fuzz })
    if (result !== false) return result
  }
  return null
}

/** Build a preview of what the file would look like after applying a diff,
 *  even when applyPatch fails — fall back to "no preview available". */
export function previewAfterDiff(source: string, unifiedDiff: string): string | null {
  return applyUnifiedDiff(source, unifiedDiff)
}

/** Extract the first file path mentioned in a unified diff, or null. */
export function diffTargetPath(unifiedDiff: string): string | null {
  const patches = parsePatch(unifiedDiff)
  const first = patches[0]
  if (!first) return null
  const fromName = first.oldFileName ?? null
  const toName = first.newFileName ?? null
  for (const raw of [toName, fromName]) {
    if (!raw) continue
    // strip a/ and b/ prefixes that git emits
    const stripped = raw.replace(/^[ab]\//, '')
    return stripped
  }
  return null
}
