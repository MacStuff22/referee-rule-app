import { describe, it, expect } from 'vitest'
import {
  encodeCompoundAnswer,
  decodeCompoundAnswer,
  encodeScoreboardAnswer,
  decodeScoreboardAnswer,
} from '@/lib/quiz/answers'

describe('compound answers', () => {
  it('round-trips the new structured format', () => {
    const perPart = [[0], [1, 3], [2]]
    expect(decodeCompoundAnswer(encodeCompoundAnswer(perPart))).toEqual(perPart)
  })
  it('decodes the legacy -1-separated format', () => {
    expect(decodeCompoundAnswer([0, -1, 1, 3, -1, 2])).toEqual([[0], [1, 3], [2]])
  })
  it('preserves an empty part in the legacy format', () => {
    expect(decodeCompoundAnswer([0, -1, -1, 2])).toEqual([[0], [], [2]])
  })
  it('returns a single empty part for empty or invalid input', () => {
    expect(decodeCompoundAnswer([])).toEqual([[]])
    expect(decodeCompoundAnswer(null)).toEqual([[]])
  })
})

describe('scoreboard answers', () => {
  it('round-trips the new structured format', () => {
    const entries = [
      { washOut: false, secs: 83 },
      { washOut: true, secs: null },
    ]
    expect(decodeScoreboardAnswer(encodeScoreboardAnswer(entries))).toEqual(entries)
  })
  it('nulls out secs when a slot is washed out on encode', () => {
    expect(encodeScoreboardAnswer([{ washOut: true, secs: 99 }])).toEqual([
      { washOut: true, secs: null },
    ])
  })
  it('decodes the legacy numeric format (-999 wash out, -1 blank)', () => {
    expect(decodeScoreboardAnswer([83, -999, -1])).toEqual([
      { washOut: false, secs: 83 },
      { washOut: true, secs: null },
      { washOut: false, secs: null },
    ])
  })
  it('handles empty or invalid input', () => {
    expect(decodeScoreboardAnswer([])).toEqual([])
    expect(decodeScoreboardAnswer(null)).toEqual([])
  })
})
