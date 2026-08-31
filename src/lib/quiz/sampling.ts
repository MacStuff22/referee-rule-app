// ============================================================
// Weighted random sampling without replacement
//
// Shared by /api/quiz/start and the Quiz Paths daily-session builder —
// both need "pick N items, higher weight = more likely, no duplicates."
// Extracted so the two call sites can't silently drift apart.
// ============================================================

export interface WeightedItem {
  id: string
  weight: number
}

export function weightedSampleWithoutReplacement(items: WeightedItem[], count: number): string[] {
  const selected: string[] = []
  const pool = [...items]
  const maxCount = Math.min(count, pool.length)

  while (selected.length < maxCount && pool.length > 0) {
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0)
    let rand = Math.random() * totalWeight
    let picked = -1
    for (let i = 0; i < pool.length; i++) {
      rand -= pool[i].weight
      if (rand <= 0) { picked = i; break }
    }
    // Floating-point guard: if rand stayed above 0, take the last item
    if (picked === -1) picked = pool.length - 1
    selected.push(pool[picked].id)
    pool.splice(picked, 1)
  }

  return [...new Set(selected)]
}
