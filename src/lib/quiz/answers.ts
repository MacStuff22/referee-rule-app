// ============================================================
// Quiz answer encode / decode
//
// A user's raw answer is stored in quiz_answers.selected_answers (jsonb).
// Scoring never depends on this — is_correct is stored separately — but the
// results-review screen reads it back, so it must be unambiguous.
//
// New rows use self-describing structures. Old rows used sentinel numbers
// (-1 to separate compound parts, -999 for a washed-out scoreboard slot).
// Every decoder here accepts BOTH, so historical data keeps working with no
// migration required.
// ============================================================

// ── Compound questions ────────────────────────────────────────────────────
// New format: number[][]  — one array of selected option indexes per part.
// Legacy format: number[] — parts flattened with -1 separators.

export function encodeCompoundAnswer(perPart: number[][]): number[][] {
  return perPart.map((part) => [...part])
}

export function decodeCompoundAnswer(raw: unknown): number[][] {
  // Empty / non-array → one empty part (consistent with the legacy decoder).
  if (!Array.isArray(raw) || raw.length === 0) return [[]]

  // New structured format: an array whose entries are themselves arrays.
  if (raw.every((x) => Array.isArray(x))) {
    return (raw as number[][]).map((part) => [...part])
  }

  // Legacy flat format: numbers separated by -1.
  const groups: number[][] = [[]]
  for (const n of raw as number[]) {
    if (n === -1) groups.push([])
    else groups[groups.length - 1].push(n)
  }
  return groups
}

// ── Scoreboard questions ──────────────────────────────────────────────────
// One entry per answerable player, in order.
//   washOut = true  → the referee marked "Wash Out" / "Coincidental Penalty"
//   secs            → the game time they entered (null when washed out / blank)
// New format: ScoreboardAnswerEntry[]
// Legacy format: number[] where -999 = wash out, -1 = blank, else seconds.

export interface ScoreboardAnswerEntry {
  washOut: boolean
  secs: number | null
}

export function encodeScoreboardAnswer(entries: ScoreboardAnswerEntry[]): ScoreboardAnswerEntry[] {
  return entries.map((e) => ({ washOut: e.washOut, secs: e.washOut ? null : e.secs }))
}

export function decodeScoreboardAnswer(raw: unknown): ScoreboardAnswerEntry[] {
  if (!Array.isArray(raw)) return []

  // New structured format: array of objects.
  if (raw.every((x) => x !== null && typeof x === 'object')) {
    return (raw as Array<{ washOut?: unknown; secs?: unknown }>).map((e) => ({
      washOut: !!e.washOut,
      secs: e.washOut ? null : (typeof e.secs === 'number' ? e.secs : null),
    }))
  }

  // Legacy numeric format.
  return (raw as number[]).map((n) => {
    if (n === -999) return { washOut: true, secs: null }
    if (n === -1) return { washOut: false, secs: null }
    return { washOut: false, secs: n }
  })
}
