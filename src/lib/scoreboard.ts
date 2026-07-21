// ============================================================
// Shared scoreboard math + game-time helpers
//
// Previously these were copy-pasted (under three different names) across
// the quiz page, the admin preview, and the question form. This is now the
// single source of truth for penalty durations, labels, and time parsing.
// ============================================================

import type { PenaltyType, SinglePenalty } from '@/types/scoreboard'

/** Duration in seconds each penalty type puts on the clock. */
export const PENALTY_SECONDS: Record<PenaltyType, number> = {
  minor: 120,
  double_minor: 240,
  major: 300,
  match: 300,
}

/** Human-readable label for each penalty type. */
export const PENALTY_DISPLAY: Record<PenaltyType, string> = {
  minor: 'Minor',
  double_minor: 'Double Minor',
  major: 'Major',
  match: 'Match',
}

/** Total seconds an event places on the clock (sum of its penalties). */
export function eventTotalSecs(evt: { penalties?: SinglePenalty[] }): number {
  return (evt.penalties ?? []).reduce(
    (sum, p) => sum + (PENALTY_SECONDS[p.penalty_type] ?? PENALTY_SECONDS.minor),
    0
  )
}

/** e.g. "Double Minor (Cross-checking) + Major (Fighting)" */
export function penaltyLabel(evt: { penalties?: SinglePenalty[] }): string {
  if (!evt.penalties?.length) return ''
  return evt.penalties
    .map((p) => {
      const type = PENALTY_DISPLAY[p.penalty_type] ?? PENALTY_DISPLAY.minor
      return p.infraction ? `${type} (${p.infraction})` : type
    })
    .join(' + ')
}

/** Format seconds as m:ss, clamped at zero. */
export function formatGT(secs: number): string {
  const rounded = Math.max(0, Math.round(secs))
  const m = Math.floor(rounded / 60)
  const s = rounded % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Strict parse of an "m:ss" string into seconds.
 * Returns null when the string is not a valid game time — callers decide
 * their own fallback (this replaces the old parseGT/parseGTInput split
 * where one returned 0 and the other returned null).
 */
export function parseGameTime(str: string): number | null {
  const m = str.trim().match(/^(\d+):(\d{2})$/)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

/** True when the seconds portion is valid (0–59). Empty / non-matching input passes. */
export function gtSecondsValid(str: string): boolean {
  const m = str.match(/^(\d+):(\d{2})$/)
  if (!m) return true
  return parseInt(m[2], 10) <= 59
}

/**
 * Smart game-time input mask: keeps digits only, auto-inserts the colon,
 * and caps at 20:00.
 *   1 digit  → 0:0X
 *   2 digits → 0:XX
 *   3 digits → X:XX
 *   4 digits → XX:XX
 */
export function maskGameTime(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4)
  if (!d) return ''
  let result: string
  if (d.length === 1) result = `0:0${d}`
  else if (d.length === 2) result = `0:${d}`
  else if (d.length === 3) result = `${d[0]}:${d.slice(1)}`
  else {
    const mins = parseInt(d.slice(0, 2), 10)
    result = `${mins}:${d.slice(2)}`
  }
  const secs = parseGameTime(result)
  if (secs !== null && secs > 1200) return '20:00'
  return result
}
