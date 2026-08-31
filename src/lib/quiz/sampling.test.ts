import { describe, it, expect } from 'vitest'
import { weightedSampleWithoutReplacement } from '@/lib/quiz/sampling'

describe('weightedSampleWithoutReplacement', () => {
  it('never repeats an item', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, weight: 1 }))
    const result = weightedSampleWithoutReplacement(items, 10)
    expect(new Set(result).size).toBe(result.length)
  })
  it('returns at most the requested count', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, weight: 1 }))
    expect(weightedSampleWithoutReplacement(items, 3)).toHaveLength(3)
  })
  it('caps the result at the pool size when count exceeds it', () => {
    const items = Array.from({ length: 3 }, (_, i) => ({ id: `q${i}`, weight: 1 }))
    expect(weightedSampleWithoutReplacement(items, 10)).toHaveLength(3)
  })
  it('returns an empty array for an empty pool', () => {
    expect(weightedSampleWithoutReplacement([], 5)).toEqual([])
  })
  it('always picks the only nonzero-weight item', () => {
    const items = [
      { id: 'a', weight: 0 },
      { id: 'b', weight: 1 },
      { id: 'c', weight: 0 },
    ]
    for (let i = 0; i < 20; i++) {
      expect(weightedSampleWithoutReplacement(items, 1)).toEqual(['b'])
    }
  })
})
