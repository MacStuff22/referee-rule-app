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

export interface SampleOptions {
  /** Re-evaluated against the pool before the first pick and after every
   *  pick — lets a caller drop items that just became ineligible (e.g. a
   *  situation-matched sibling of something just picked) without this
   *  function knowing why. */
  isExcluded?: (id: string) => boolean
  /** Fired with each picked id, right after it's spliced out of the pool —
   *  a hook for the caller to update whatever state `isExcluded` reads on
   *  the next iteration. */
  onPick?: (pickedId: string) => void
}

export function weightedSampleWithoutReplacement(
  items: WeightedItem[],
  count: number,
  options: SampleOptions = {}
): string[] {
  const selected: string[] = []
  let pool = options.isExcluded ? items.filter((item) => !options.isExcluded!(item.id)) : [...items]
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
    const pickedId = pool[picked].id
    selected.push(pickedId)
    pool.splice(picked, 1)
    options.onPick?.(pickedId)
    if (options.isExcluded) pool = pool.filter((item) => !options.isExcluded!(item.id))
  }

  return [...new Set(selected)]
}
