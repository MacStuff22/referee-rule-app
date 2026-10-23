import { describe, it, expect } from 'vitest'
import {
  scheduledDaysBetween,
  remainingScheduledDays,
  computeQuestionsPerDay,
  computeTargetEndDate,
  reflowPace,
  reservedCoverageSlots,
  computePace,
  finishDateEnds,
  utcDateOnly,
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
  // Afternoon UTC times: a new day counts from about midday UTC (see computePace).
  const end = new Date('2026-02-01')

  it('counts today and the finish date itself', () => {
    expect(remainingScheduledDays(new Date('2026-01-25T18:00:00Z'), end, 7)).toBe(8)
    expect(remainingScheduledDays(new Date('2026-02-01T18:00:00Z'), end, 7)).toBe(1)
  })
  it('reaches 0 once the finish date is over', () => {
    expect(remainingScheduledDays(new Date('2026-02-02T00:00:00Z'), end, 7)).toBe(0)
    expect(remainingScheduledDays(new Date('2026-03-01T18:00:00Z'), end, 7)).toBe(0)
  })
  it('scales with days per week', () => {
    const oct31 = new Date('2026-10-31')
    expect(remainingScheduledDays(new Date('2026-10-22T18:00:00Z'), oct31, 5)).toBe(7) // 10 days x 5/7
    expect(remainingScheduledDays(new Date('2026-10-22T18:00:00Z'), oct31, 1)).toBe(1)
  })
  it('hands everything to today when a once-a-week plan reaches its last day', () => {
    expect(remainingScheduledDays(new Date('2026-10-31T18:00:00Z'), new Date('2026-10-31'), 1)).toBe(0)
  })
  it('switches day at the same midday point the pace line does', () => {
    const oct31 = new Date('2026-10-31')
    expect(remainingScheduledDays(new Date('2026-10-23T08:00:00Z'), oct31, 5)).toBe(7)
    expect(remainingScheduledDays(new Date('2026-10-23T13:00:00Z'), oct31, 5)).toBe(6)
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
  // The real plan from the Oct 22 incident: 655 questions, Sep 1 -> Oct 31 (both
  // dates are study days), 5 days a week, checked on Oct 22.
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
    expect(r.expectedCount).toBe(550)
    expect(r.expectedByYesterday).toBe(535)
    expect(r.expectedPercent).toBe(84)
  })

  it('reads on-track on the line, due-today a little under it, and behind only after a missed day', () => {
    expect(pace(550).status).toBe('on-track')
    expect(pace(549).status).toBe('due-today')
    expect(pace(535).status).toBe('due-today')
    expect(pace(534).status).toBe('behind')
    expect(pace(530).status).toBe('behind')
  })

  it('reads ahead only when more than 10% past the line', () => {
    expect(pace(605).status).toBe('on-track')
    expect(pace(606).status).toBe('ahead')
  })

  it('on the first day, owes one day of questions but is not behind', () => {
    const r = pace(0, { today: new Date('2026-09-01T15:00:00Z') })
    expect(r.expectedCount).toBe(14)
    expect(r.expectedByYesterday).toBe(0)
    expect(r.status).toBe('due-today')
  })

  it('counts a study day as owed from midday UTC (existing day rounding)', () => {
    expect(pace(0, { today: new Date('2026-10-22T11:00:00Z') }).expectedCount).toBe(535)
    expect(pace(0, { today: new Date('2026-10-22T13:00:00Z') }).expectedCount).toBe(550)
  })

  it('expects the whole pool on the finish date, with that last day still owed', () => {
    const onFinishDate = { today: new Date('2026-10-31T18:00:00Z') }
    expect(pace(655, onFinishDate)).toMatchObject({ expectedCount: 655, expectedPercent: 100, status: 'on-track' })
    expect(pace(645, onFinishDate).status).toBe('due-today')
    expect(pace(600, onFinishDate).status).toBe('behind')
  })

  it('does not expect the whole pool the day before the finish date', () => {
    expect(pace(0, { today: new Date('2026-10-30T18:00:00Z') }).expectedCount).toBe(640)
  })

  it('reads behind once the finish date is over and questions are left', () => {
    expect(pace(645, { today: new Date('2026-11-02T12:00:00Z') }).status).toBe('behind')
  })

  it('treats a plan whose finish date is its start date as a one-day plan', () => {
    const oneDay = { targetEndDate: incident.startDate }
    expect(pace(0, { ...oneDay, today: new Date('2026-09-01T18:00:00Z') }).expectedCount).toBe(655)
    expect(pace(0, { ...oneDay, today: new Date('2026-09-02') }).expectedCount).toBe(655)
  })

  it('multiplies before dividing, so exact steps are not mis-floored', () => {
    const start = new Date('2026-01-01')
    const r = computePace({
      poolSize: 100,
      coveredCount: 0,
      startDate: start,
      targetEndDate: new Date(start.getTime() + 99 * 86_400_000), // 100 study days, both ends included
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
    expect(pace(563).expectedCount).toBe(550)
    const extended = pace(563, { targetEndDate: new Date('2026-11-14') })
    expect(extended.expectedCount).toBe(448)
    expect(extended.status).toBe('ahead')
  })
})

// The finish date is a study day: start Oct 1, finish Oct 10, 100 questions, every
// day is 10 study days and 10 questions a day, however many are actually done.
describe('a plan counts both its start date and its finish date', () => {
  const start = new Date('2026-10-01')
  const end = new Date('2026-10-10')

  it('works out to 10 a day, on the creation screen and in the line', () => {
    expect(computeQuestionsPerDay(100, start, end, 7)).toBe(10)
    const line = (day: number, covered = 0) =>
      computePace({
        poolSize: 100,
        coveredCount: covered,
        startDate: start,
        targetEndDate: end,
        daysPerWeek: 7,
        today: new Date(`2026-10-${String(day).padStart(2, '0')}T18:00:00Z`),
      }).expectedCount
    expect(Array.from({ length: 10 }, (_, i) => line(i + 1))).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
    expect(line(10, 100)).toBe(100)
    expect(line(10, 3)).toBe(100) // what you have done never moves the line
  })

  it('does not depend on the time of day the plan was created, once the start is date-only', () => {
    expect(computeQuestionsPerDay(100, utcDateOnly(new Date('2026-10-01T23:59:00Z')), end, 7)).toBe(10)
    expect(computeQuestionsPerDay(100, utcDateOnly(new Date('2026-10-01T00:01:00Z')), end, 7)).toBe(10)
  })

  it('finishes on Oct 10 when a pace of 10 a day is chosen instead of a date', () => {
    expect(computeTargetEndDate(100, 10, start, 7).toISOString().slice(0, 10)).toBe('2026-10-10')
    expect(computeTargetEndDate(100, 10, start, 5).toISOString().slice(0, 10)).toBe('2026-10-14') // 14 days at 5/week
    expect(computeTargetEndDate(1, 1, start, 7).toISOString().slice(0, 10)).toBe('2026-10-01') // one question, one day
  })

  it('round-trips: the finish date for a daily count never needs more than that daily count', () => {
    for (const daysPerWeek of [1, 2, 3, 4, 5, 6, 7]) {
      for (const pool of [1, 7, 50, 100, 655, 1000]) {
        for (const perDay of [1, 3, 10, 19, 40]) {
          const finish = computeTargetEndDate(pool, perDay, start, daysPerWeek)
          expect(computeQuestionsPerDay(pool, start, finish, daysPerWeek)).toBeLessThanOrEqual(perDay)
        }
      }
    }
  })

  it('finishDateEnds is the start of the day after, and utcDateOnly drops the time of day', () => {
    expect(finishDateEnds(end).toISOString()).toBe('2026-10-11T00:00:00.000Z')
    expect(utcDateOnly(new Date('2026-10-01T18:30:00Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })
})
