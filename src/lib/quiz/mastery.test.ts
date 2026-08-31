import { describe, it, expect } from 'vitest'
import {
  classifyMastery,
  updateEma,
  isDueForRefresh,
  nextRefreshInterval,
  categoryWeight,
  weightForCategory,
  MASTERY_CONFIG,
} from '@/lib/quiz/mastery'

describe('classifyMastery', () => {
  it('is new with zero answers', () => {
    expect(classifyMastery(0, 0.5)).toBe('new')
  })
  it('is learning below the learning sample size regardless of score', () => {
    expect(classifyMastery(4, 0.95)).toBe('learning')
  })
  it('is developing once past the sample size but below the developing ceiling', () => {
    expect(classifyMastery(5, 0.6)).toBe('developing')
  })
  it('is proficient above the developing ceiling but below the mastered floor', () => {
    expect(classifyMastery(5, 0.7)).toBe('proficient')
  })
  it('is proficient (not mastered) above the mastered floor without enough samples', () => {
    expect(classifyMastery(6, 0.9)).toBe('proficient')
  })
  it('is mastered above the floor with enough samples', () => {
    expect(classifyMastery(8, 0.9)).toBe('mastered')
  })
})

describe('updateEma', () => {
  it('moves toward 1 on a correct answer', () => {
    expect(updateEma(0.5, true)).toBeCloseTo(0.6, 5)
  })
  it('moves toward 0 on an incorrect answer', () => {
    expect(updateEma(0.5, false)).toBeCloseTo(0.4, 5)
  })
  it('converges toward 1 after a long correct streak', () => {
    let score = 0.2
    for (let i = 0; i < 50; i++) score = updateEma(score, true)
    expect(score).toBeGreaterThan(0.95)
  })
  it('converges toward 0 after a long incorrect streak', () => {
    let score = 0.8
    for (let i = 0; i < 50; i++) score = updateEma(score, false)
    expect(score).toBeLessThan(0.05)
  })
})

describe('isDueForRefresh', () => {
  const now = new Date('2026-01-15T00:00:00Z')
  it('is not due before the interval elapses', () => {
    expect(isDueForRefresh(new Date('2026-01-05T00:00:00Z'), 14, now)).toBe(false)
  })
  it('is due once the interval elapses', () => {
    expect(isDueForRefresh(new Date('2026-01-01T00:00:00Z'), 14, now)).toBe(true)
  })
  it('is due exactly at the boundary', () => {
    expect(isDueForRefresh(new Date('2026-01-01T00:00:00Z'), 14, new Date('2026-01-15T00:00:00Z'))).toBe(true)
  })
})

describe('nextRefreshInterval', () => {
  it('doubles on a correct refresher', () => {
    expect(nextRefreshInterval(14, true)).toBe(28)
  })
  it('caps growth at the max interval', () => {
    expect(nextRefreshInterval(80, true)).toBe(MASTERY_CONFIG.maxRefreshIntervalDays)
  })
  it('resets to the base interval on a miss', () => {
    expect(nextRefreshInterval(60, false)).toBe(MASTERY_CONFIG.baseRefreshIntervalDays)
  })
})

describe('categoryWeight', () => {
  it('gives new/learning categories the coverage-priority weight', () => {
    expect(categoryWeight('new', 0.5, false)).toBe(MASTERY_CONFIG.newCategoryWeight)
    expect(categoryWeight('learning', 0.5, false)).toBe(MASTERY_CONFIG.newCategoryWeight)
  })
  it('gives a due mastered category a moderate weight', () => {
    expect(categoryWeight('mastered', 0.95, true)).toBe(MASTERY_CONFIG.masteredDueWeight)
  })
  it('gives a not-due mastered category a low but nonzero weight', () => {
    expect(categoryWeight('mastered', 0.95, false)).toBe(MASTERY_CONFIG.masteredNotDueWeight)
  })
  it('weights developing/proficient inversely to their score, with a floor', () => {
    expect(categoryWeight('developing', 0.3, false)).toBeCloseTo(0.85, 5)
    expect(categoryWeight('proficient', 1.05, false)).toBe(MASTERY_CONFIG.minDevelopingWeight)
  })
})

describe('weightForCategory', () => {
  const now = new Date('2026-01-15T00:00:00Z')
  it('treats a missing row as new', () => {
    expect(weightForCategory(undefined, now)).toBe(MASTERY_CONFIG.newCategoryWeight)
  })
  it('treats a row with zero answers as new', () => {
    expect(weightForCategory({ ema_score: 0.5, total_answered: 0, last_answered_at: null, refresh_interval_days: 14 }, now))
      .toBe(MASTERY_CONFIG.newCategoryWeight)
  })
  it('applies the refresh-due weight for a mastered category last seen long ago', () => {
    const row = { ema_score: 0.95, total_answered: 10, last_answered_at: '2025-12-01T00:00:00Z', refresh_interval_days: 14 }
    expect(weightForCategory(row, now)).toBe(MASTERY_CONFIG.masteredDueWeight)
  })
  it('applies the not-due weight for a mastered category seen recently', () => {
    const row = { ema_score: 0.95, total_answered: 10, last_answered_at: '2026-01-14T00:00:00Z', refresh_interval_days: 14 }
    expect(weightForCategory(row, now)).toBe(MASTERY_CONFIG.masteredNotDueWeight)
  })
})
