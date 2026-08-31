import { describe, it, expect } from 'vitest'
import {
  scheduledDaysBetween,
  remainingScheduledDays,
  computeQuestionsPerDay,
  computeTargetEndDate,
  reflowPace,
  reservedCoverageSlots,
} from '@/lib/quiz/paths'

describe('scheduledDaysBetween', () => {
  it('counts every day when daysPerWeek is 7', () => {
    expect(scheduledDaysBetween(new Date('2026-01-01'), new Date('2026-01-08'), 7)).toBe(7)
  })
  it('scales down for fewer days per week', () => {
    expect(scheduledDaysBetween(new Date('2026-01-01'), new Date('2026-02-19'), 5)).toBeLessThan(
      scheduledDaysBetween(new Date('2026-01-01'), new Date('2026-02-19'), 7)
    )
  })
})

describe('remainingScheduledDays', () => {
  it('reaches 0 once today is at or past the deadline', () => {
    expect(remainingScheduledDays(new Date('2026-03-01'), new Date('2026-02-01'), 7)).toBe(0)
    expect(remainingScheduledDays(new Date('2026-02-01'), new Date('2026-02-01'), 7)).toBe(0)
  })
  it('counts down as the deadline approaches', () => {
    expect(remainingScheduledDays(new Date('2026-01-25'), new Date('2026-02-01'), 7)).toBe(7)
  })
})

describe('computeQuestionsPerDay', () => {
  it('spreads the pool over the scheduled days', () => {
    const perDay = computeQuestionsPerDay(655, new Date('2026-01-01'), new Date('2026-04-01'), 7)
    expect(perDay).toBeGreaterThan(0)
    expect(perDay).toBeLessThan(20)
  })
  it('increases as the deadline tightens', () => {
    const loose = computeQuestionsPerDay(655, new Date('2026-01-01'), new Date('2026-06-01'), 7)
    const tight = computeQuestionsPerDay(655, new Date('2026-01-01'), new Date('2026-02-01'), 7)
    expect(tight).toBeGreaterThan(loose)
  })
})

describe('computeTargetEndDate', () => {
  it('produces a later date for a slower pace', () => {
    const slow = computeTargetEndDate(655, 5, new Date('2026-01-01'), 7)
    const fast = computeTargetEndDate(655, 20, new Date('2026-01-01'), 7)
    expect(slow.getTime()).toBeGreaterThan(fast.getTime())
  })
})

describe('reflowPace', () => {
  it('recomputes the daily count when still within the ceiling', () => {
    const result = reflowPace(100, 20, 10)
    expect(result.questionsPerDay).toBe(5)
    expect(result.extendEndDate).toBe(false)
  })
  it('caps the daily count and extends the deadline when far behind', () => {
    const result = reflowPace(500, 10, 10)
    expect(result.questionsPerDay).toBe(20)
    expect(result.extendEndDate).toBe(true)
  })
  it('leaves pace untouched when nothing remains', () => {
    expect(reflowPace(0, 10, 8)).toEqual({ questionsPerDay: 8, extendEndDate: false })
  })
})

describe('reservedCoverageSlots', () => {
  it('reserves nothing when everything is covered', () => {
    expect(reservedCoverageSlots(0, 10, 8)).toBe(0)
  })
  it('spreads uncovered questions across remaining days', () => {
    expect(reservedCoverageSlots(100, 10, 8)).toBe(8)
    expect(reservedCoverageSlots(20, 10, 8)).toBe(2)
  })
  it('reserves everything left when no days remain', () => {
    expect(reservedCoverageSlots(15, 0, 8)).toBe(8)
  })
})
