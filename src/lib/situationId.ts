// ============================================================
// Situation ID natural sort — IDs like "12A" need numeric + letter
// ordering (12A before 12B before 13A), not plain string sort. Shared
// between the admin questions list and the Test Quiz situation picker.
// ============================================================

export function parseSituationId(id: string): { num: number; letters: string } {
  const match = id.match(/^(\d+)([A-Z]*)$/i)
  if (!match) return { num: Infinity, letters: id }
  return { num: parseInt(match[1], 10), letters: match[2].toUpperCase() }
}

export function compareSituationIds(a: string, b: string): number {
  const pa = parseSituationId(a || '')
  const pb = parseSituationId(b || '')
  if (pa.num !== pb.num) return pa.num - pb.num
  if (pa.letters.length !== pb.letters.length) return pa.letters.length - pb.letters.length
  return pa.letters.localeCompare(pb.letters)
}
