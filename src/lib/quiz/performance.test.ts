import { describe, it, expect } from 'vitest'
import { aggregateCategoryScores } from '@/lib/quiz/performance'

describe('aggregateCategoryScores', () => {
  it('tallies correct vs total per category', () => {
    const rows = [
      { is_correct: true, questions: { category: 'Icing' } },
      { is_correct: false, questions: { category: 'Icing' } },
      { is_correct: true, questions: { category: 'Off-side' } },
    ]
    expect(aggregateCategoryScores(rows)).toEqual({
      Icing: { correct: 1, total: 2 },
      'Off-side': { correct: 1, total: 1 },
    })
  })
  it('accepts the embedded relation as a one-element array', () => {
    const rows = [{ is_correct: true, questions: [{ category: 'Tripping' }] }]
    expect(aggregateCategoryScores(rows)).toEqual({ Tripping: { correct: 1, total: 1 } })
  })
  it('buckets a missing category under Unknown', () => {
    const rows = [{ is_correct: false, questions: null }]
    expect(aggregateCategoryScores(rows)).toEqual({ Unknown: { correct: 0, total: 1 } })
  })
  it('returns an empty object for no answers', () => {
    expect(aggregateCategoryScores([])).toEqual({})
  })
})
