// ============================================================
// Penalty table placement marker
//
// Admins can position a question's penalty table anywhere inside the
// Situation/Question text (matching the Situation Book layout, where
// text → table → more text is common). The position is stored as a
// literal marker string embedded directly in `questions.text` — no
// extra column needed. Questions saved before this feature shipped have
// no marker, so callers must keep rendering those exactly as before
// (table in its own block above the full text).
// ============================================================

export const PENALTY_TABLE_MARKER = '[[Penalty Table]]'

export function hasPenaltyTableMarker(text: string): boolean {
  return text.includes(PENALTY_TABLE_MARKER)
}

/** Remove every occurrence of the marker, collapsing any doubled-up whitespace it leaves behind. */
export function stripPenaltyTableMarker(text: string): string {
  return text.split(PENALTY_TABLE_MARKER).join(' ').replace(/[ \t]{2,}/g, ' ').trim()
}

/**
 * Split text on the first marker occurrence into { before, after }.
 * Returns null when there is no marker — callers fall back to legacy layout.
 */
export function splitOnPenaltyTableMarker(text: string): { before: string; after: string } | null {
  const idx = text.indexOf(PENALTY_TABLE_MARKER)
  if (idx === -1) return null
  return {
    before: text.slice(0, idx).trim(),
    after: text.slice(idx + PENALTY_TABLE_MARKER.length).trim(),
  }
}
