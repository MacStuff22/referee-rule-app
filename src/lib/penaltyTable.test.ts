import { describe, it, expect } from 'vitest'
import {
  PENALTY_TABLE_MARKER,
  hasPenaltyTableMarker,
  stripPenaltyTableMarker,
  splitOnPenaltyTableMarker,
} from '@/lib/penaltyTable'

describe('splitOnPenaltyTableMarker', () => {
  it('returns null when there is no marker (legacy questions)', () => {
    expect(splitOnPenaltyTableMarker('No marker here.')).toBeNull()
  })

  it('splits text before and after the marker', () => {
    const text = `The following minor penalties are assessed to Team A: ${PENALTY_TABLE_MARKER} Play is continuous. When the clock hits 11:16, what happens?`
    const result = splitOnPenaltyTableMarker(text)
    expect(result).toEqual({
      before: 'The following minor penalties are assessed to Team A:',
      after: 'Play is continuous. When the clock hits 11:16, what happens?',
    })
  })

  it('supports the marker at the very start', () => {
    const text = `${PENALTY_TABLE_MARKER} Rest of the question.`
    expect(splitOnPenaltyTableMarker(text)).toEqual({ before: '', after: 'Rest of the question.' })
  })

  it('supports the marker at the very end', () => {
    const text = `Situation text. ${PENALTY_TABLE_MARKER}`
    expect(splitOnPenaltyTableMarker(text)).toEqual({ before: 'Situation text.', after: '' })
  })

  it('only splits on the first occurrence if duplicated', () => {
    const text = `A ${PENALTY_TABLE_MARKER} B ${PENALTY_TABLE_MARKER} C`
    expect(splitOnPenaltyTableMarker(text)).toEqual({ before: 'A', after: `B ${PENALTY_TABLE_MARKER} C` })
  })
})

describe('hasPenaltyTableMarker / stripPenaltyTableMarker', () => {
  it('detects presence of the marker', () => {
    expect(hasPenaltyTableMarker(`before ${PENALTY_TABLE_MARKER} after`)).toBe(true)
    expect(hasPenaltyTableMarker('no marker')).toBe(false)
  })

  it('removes the marker and collapses the whitespace it leaves behind', () => {
    expect(stripPenaltyTableMarker(`A ${PENALTY_TABLE_MARKER} B`)).toBe('A B')
  })

  it('removes multiple marker occurrences', () => {
    expect(stripPenaltyTableMarker(`A ${PENALTY_TABLE_MARKER} ${PENALTY_TABLE_MARKER} B`)).not.toContain(PENALTY_TABLE_MARKER)
  })
})
