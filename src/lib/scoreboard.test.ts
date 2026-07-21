import { describe, it, expect } from 'vitest'
import {
  formatGT,
  parseGameTime,
  maskGameTime,
  gtSecondsValid,
  eventTotalSecs,
  penaltyLabel,
} from '@/lib/scoreboard'

describe('formatGT', () => {
  it('formats seconds as m:ss', () => {
    expect(formatGT(0)).toBe('0:00')
    expect(formatGT(9)).toBe('0:09')
    expect(formatGT(83)).toBe('1:23')
    expect(formatGT(120)).toBe('2:00')
  })
  it('clamps negatives to zero', () => {
    expect(formatGT(-5)).toBe('0:00')
  })
  it('rounds fractional seconds', () => {
    expect(formatGT(59.6)).toBe('1:00')
  })
})

describe('parseGameTime', () => {
  it('parses valid m:ss into seconds', () => {
    expect(parseGameTime('0:05')).toBe(5)
    expect(parseGameTime('1:23')).toBe(83)
    expect(parseGameTime('20:00')).toBe(1200)
  })
  it('returns null for invalid input', () => {
    expect(parseGameTime('')).toBeNull()
    expect(parseGameTime('123')).toBeNull()
    expect(parseGameTime('1:2')).toBeNull()
    expect(parseGameTime('abc')).toBeNull()
  })
  it('round-trips with formatGT', () => {
    expect(formatGT(parseGameTime('3:07')!)).toBe('3:07')
  })
})

describe('maskGameTime', () => {
  it('auto-inserts the colon as digits are typed', () => {
    expect(maskGameTime('')).toBe('')
    expect(maskGameTime('5')).toBe('0:05')
    expect(maskGameTime('45')).toBe('0:45')
    expect(maskGameTime('123')).toBe('1:23')
    expect(maskGameTime('1234')).toBe('12:34')
  })
  it('strips non-digits', () => {
    expect(maskGameTime('1:23')).toBe('1:23')
    expect(maskGameTime('ab12cd')).toBe('0:12')
  })
  it('caps at 20:00', () => {
    expect(maskGameTime('9999')).toBe('20:00')
  })
})

describe('gtSecondsValid', () => {
  it('rejects a seconds value over 59', () => {
    expect(gtSecondsValid('1:60')).toBe(false)
    expect(gtSecondsValid('1:75')).toBe(false)
  })
  it('accepts valid times and partial input', () => {
    expect(gtSecondsValid('1:00')).toBe(true)
    expect(gtSecondsValid('1:59')).toBe(true)
    expect(gtSecondsValid('12')).toBe(true) // partial (no full match) passes
  })
})

describe('eventTotalSecs', () => {
  it('sums penalty durations', () => {
    expect(eventTotalSecs({ penalties: [{ penalty_type: 'minor', infraction: '' }] })).toBe(120)
    expect(eventTotalSecs({ penalties: [{ penalty_type: 'double_minor', infraction: '' }] })).toBe(240)
    expect(eventTotalSecs({ penalties: [{ penalty_type: 'major', infraction: '' }] })).toBe(300)
    expect(
      eventTotalSecs({
        penalties: [
          { penalty_type: 'minor', infraction: '' },
          { penalty_type: 'major', infraction: '' },
        ],
      })
    ).toBe(420)
  })
  it('handles no penalties', () => {
    expect(eventTotalSecs({ penalties: [] })).toBe(0)
    expect(eventTotalSecs({})).toBe(0)
  })
})

describe('penaltyLabel', () => {
  it('labels a single penalty', () => {
    expect(penaltyLabel({ penalties: [{ penalty_type: 'minor', infraction: '' }] })).toBe('Minor')
  })
  it('includes the infraction when present', () => {
    expect(
      penaltyLabel({ penalties: [{ penalty_type: 'double_minor', infraction: 'High-sticking' }] })
    ).toBe('Double Minor (High-sticking)')
  })
  it('joins combined penalties with a plus', () => {
    expect(
      penaltyLabel({
        penalties: [
          { penalty_type: 'minor', infraction: '' },
          { penalty_type: 'major', infraction: 'Fighting' },
        ],
      })
    ).toBe('Minor + Major (Fighting)')
  })
})
