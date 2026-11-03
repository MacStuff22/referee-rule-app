import { describe, it, expect } from 'vitest'
import { describeDue, formatPlanDate } from '@/lib/quiz/pathLabels'

describe('formatPlanDate', () => {
  it('reads the stored date as the calendar date it is', () => {
    expect(formatPlanDate('2026-11-29')).toBe('Nov 29, 2026')
    expect(formatPlanDate('2026-01-01')).toBe('Jan 1, 2026')
  })
})

describe('describeDue', () => {
  it('counts the days left', () => {
    expect(describeDue('2026-11-29', '2026-11-02')).toEqual({ text: '27 days left', tone: 'normal' })
    expect(describeDue('2026-11-29', '2026-11-28')).toEqual({ text: '1 day left', tone: 'soon' })
  })

  it('flags a due date that is close, and the day itself', () => {
    expect(describeDue('2026-11-05', '2026-11-02').tone).toBe('soon')
    expect(describeDue('2026-11-29', '2026-11-29')).toEqual({ text: 'Due today', tone: 'soon' })
  })

  it('says how long overdue once the due date has passed', () => {
    expect(describeDue('2026-10-31', '2026-11-01')).toEqual({ text: '1 day overdue', tone: 'late' })
    expect(describeDue('2026-10-31', '2026-11-03')).toEqual({ text: '3 days overdue', tone: 'late' })
  })
})
