import { describe, it, expect } from 'vitest'
import {
  scheduledDaysBetween,
  remainingScheduledDays,
  computeQuestionsPerDay,
  computeTargetEndDate,
  reflowPace,
  reservedCoverageSlots,
  computePace,
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

describe('computePace', () => {
  // The real incident: a 655-question plan, Sep 1 -> Oct 31, 5 days a week, on Oct 22.
  const incident = {
    poolSize: 655,
    startDate: new Date('2026-09-01'),
    targetEndDate: new Date('2026-10-31'),
    daysPerWeek: 5,
    today: new Date('2026-10-22T18:00:00Z'),
  }
  const pace = (covered: number, over: Partial<typeof incident> = {}) =>
    computePace({ ...incident, ...over, coveredCount: covered })

  it('puts the marker on a straight line to the deadline, not at 100% (the Oct 22 incident)', () => {
    const r = pace(563)
    expect(r.expectedCount).toBe(563)
    expect(r.expectedByYesterday).toBe(548)
    expect(r.expectedPercent).toBe(86)
  })

  it('reads on-track on the line, due-today a little under it, and behind only after a missed day', () => {
    expect(pace(563).status).toBe('on-track')
    expect(pace(562).status).toBe('due-today')
    expect(pace(548).status).toBe('due-today')
    expect(pace(547).status).toBe('behind')
    expect(pace(540).status).toBe('behind')
  })

  it('reads ahead only when more than 10% past the line', () => {
    expect(pace(619).status).toBe('on-track')
    expect(pace(620).status).toBe('ahead')
  })

  it('on the first day, owes one day of questions but is not behind', () => {
    const r = pace(0, { today: new Date('2026-09-01T15:00:00Z') })
    expect(r.expectedCount).toBe(15)
    expect(r.expectedByYesterday).toBe(0)
    expect(r.status).toBe('due-today')
  })

  it('counts a study day as owed from midday UTC (existing day rounding)', () => {
    expect(pace(0, { today: new Date('2026-10-22T11:00:00Z') }).expectedCount).toBe(548)
    expect(pace(0, { today: new Date('2026-10-22T13:00:00Z') }).expectedCount).toBe(563)
  })

  it('expects the whole pool at the deadline, with the last day still owed', () => {
    const atDeadline = { today: new Date('2026-10-31') }
    expect(pace(655, atDeadline)).toMatchObject({ expectedCount: 655, expectedPercent: 100, status: 'on-track' })
    expect(pace(645, atDeadline).status).toBe('due-today')
    expect(pace(600, atDeadline).status).toBe('behind')
  })

  it('reads behind once the deadline has passed with questions left', () => {
    expect(pace(645, { today: new Date('2026-11-01T12:00:00Z') }).status).toBe('behind')
  })

  it('expects the whole pool from a plan whose end is not after its start', () => {
    const r = pace(0, { targetEndDate: incident.startDate, today: new Date('2026-09-02') })
    expect(r.expectedCount).toBe(655)
  })

  it('multiplies before dividing, so exact steps are not mis-floored', () => {
    const start = new Date('2026-01-01')
    const r = computePace({
      poolSize: 100,
      coveredCount: 0,
      startDate: start,
      targetEndDate: new Date(start.getTime() + 100 * 86_400_000),
      daysPerWeek: 7,
      today: new Date(start.getTime() + 29 * 86_400_000),
    })
    expect(r.expectedCount).toBe(29) // dividing first gives 28.999999999999996 -> 28
  })

  it('handles a once-a-week plan', () => {
    const oneADay = (iso: string) => pace(0, { daysPerWeek: 1, today: new Date(iso) }).expectedCount
    expect(oneADay('2026-09-01T15:00:00Z')).toBe(72)
    expect(oneADay('2026-09-11T00:00:00Z')).toBe(72)
    expect(oneADay('2026-09-12T00:00:00Z')).toBe(145)
  })

  it('handles an empty pool and a tiny pool', () => {
    expect(pace(0, { poolSize: 0 })).toMatchObject({ expectedCount: 0, expectedPercent: 0, status: 'on-track' })
    expect(pace(1, { poolSize: 3, today: new Date('2026-09-01T15:00:00Z') }).status).toBe('ahead')
  })

  it('never goes backwards over time, and always keeps yesterday <= now <= pool', () => {
    for (const daysPerWeek of [1, 2, 3, 4, 5, 6, 7]) {
      for (const poolSize of [1, 3, 10, 100, 655, 1000]) {
        let previous = 0
        for (let h = -24; h <= 62 * 24; h += 6) {
          const today = new Date(incident.startDate.getTime() + h * 3_600_000)
          const r = computePace({ ...incident, poolSize, daysPerWeek, coveredCount: 0, today })
          expect(r.expectedCount).toBeGreaterThanOrEqual(previous)
          expect(r.expectedByYesterday).toBeLessThanOrEqual(r.expectedCount)
          expect(r.expectedCount).toBeLessThanOrEqual(poolSize)
          expect(r.expectedPercent).toBeGreaterThanOrEqual(0)
          expect(r.expectedPercent).toBeLessThanOrEqual(100)
          previous = r.expectedCount
        }
      }
    }
  })

  it('re-anchors the line when the deadline is extended (accepted: the original deadline is not stored)', () => {
    expect(pace(563).expectedCount).toBe(563)
    const extended = pace(563, { targetEndDate: new Date('2026-11-14') })
    expect(extended.expectedCount).toBe(457)
    expect(extended.status).toBe('ahead')
  })
})
