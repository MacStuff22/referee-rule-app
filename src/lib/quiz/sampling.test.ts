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

  describe('with isExcluded/onPick', () => {
    // 'a' and 'b' are a matched pair; picking one should exclude the other
    // for the rest of the same call, across repeated runs.
    function partnerOf(id: string): string | undefined {
      return id === 'a' ? 'b' : id === 'b' ? 'a' : undefined
    }

    it('never lets a declared partner be picked after its match', () => {
      const items = [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1 },
        { id: 'c', weight: 1 },
        { id: 'd', weight: 1 },
      ]
      for (let i = 0; i < 30; i++) {
        const excluded = new Set<string>()
        const result = weightedSampleWithoutReplacement(items, 4, {
          isExcluded: (id) => excluded.has(id),
          onPick: (id) => {
            const partner = partnerOf(id)
            if (partner) excluded.add(partner)
          },
        })
        expect(result.includes('a') && result.includes('b')).toBe(false)
      }
    })

    it('excludes the very first pick via pre-seeding', () => {
      const items = [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1 },
      ]
      for (let i = 0; i < 20; i++) {
        const result = weightedSampleWithoutReplacement(items, 2, { isExcluded: (id) => id === 'a' })
        expect(result).toEqual(['b'])
      }
    })
  })
})
