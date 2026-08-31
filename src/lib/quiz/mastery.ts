// ============================================================
// Category mastery
//
// Recency-weighted (not lifetime) accuracy per user+category, stored
// incrementally in user_category_mastery so quiz-start never has to
// re-scan a user's full answer history. An exponential moving average
// lets a category's score reflect recent performance without a separate
// reset step, and a "mastered" category gets scheduled refreshers
// (interval doubles on success, resets on a miss) so long-untouched
// strengths don't quietly decay back into weaknesses.
// ============================================================

export type MasteryStatus = 'new' | 'learning' | 'developing' | 'proficient' | 'mastered'

export const MASTERY_CONFIG = {
  emaAlpha: 0.2,
  learningSampleSize: 5,
  masteredSampleSize: 8,
  developingCeiling: 0.65,
  masteredFloor: 0.85,
  baseRefreshIntervalDays: 14,
  maxRefreshIntervalDays: 90,
  newCategoryWeight: 1.0,
  masteredDueWeight: 0.4,
  masteredNotDueWeight: 0.05,
  minDevelopingWeight: 0.15,
  repeatCooldownDays: 14,
  repeatCooldownMultiplier: 0.05,
} as const

export interface CategoryMasteryRow {
  ema_score: number
  total_answered: number
  last_answered_at: string | null
  refresh_interval_days: number
}

export function classifyMastery(totalAnswered: number, emaScore: number): MasteryStatus {
  if (totalAnswered === 0) return 'new'
  if (totalAnswered < MASTERY_CONFIG.learningSampleSize) return 'learning'
  if (emaScore < MASTERY_CONFIG.developingCeiling) return 'developing'
  if (emaScore < MASTERY_CONFIG.masteredFloor || totalAnswered < MASTERY_CONFIG.masteredSampleSize) return 'proficient'
  return 'mastered'
}

export function updateEma(oldScore: number, wasCorrect: boolean, alpha: number = MASTERY_CONFIG.emaAlpha): number {
  return oldScore + alpha * ((wasCorrect ? 1 : 0) - oldScore)
}

export function isDueForRefresh(lastAnsweredAt: Date, refreshIntervalDays: number, now: Date): boolean {
  const daysSince = (now.getTime() - lastAnsweredAt.getTime()) / 86_400_000
  return daysSince >= refreshIntervalDays
}

// SM-2-style interval growth applied at category (not per-question) granularity.
export function nextRefreshInterval(currentIntervalDays: number, wasCorrect: boolean): number {
  if (!wasCorrect) return MASTERY_CONFIG.baseRefreshIntervalDays
  return Math.min(currentIntervalDays * 2, MASTERY_CONFIG.maxRefreshIntervalDays)
}

export function categoryWeight(status: MasteryStatus, emaScore: number, dueForRefresh: boolean): number {
  if (status === 'new' || status === 'learning') return MASTERY_CONFIG.newCategoryWeight
  if (status === 'mastered') return dueForRefresh ? MASTERY_CONFIG.masteredDueWeight : MASTERY_CONFIG.masteredNotDueWeight
  return Math.max(MASTERY_CONFIG.minDevelopingWeight, 1.15 - emaScore)
}

/** Full pipeline from a stored mastery row (or none, for a never-seen category) to its quiz weight. */
export function weightForCategory(row: CategoryMasteryRow | undefined, now: Date): number {
  if (!row || row.total_answered === 0) return MASTERY_CONFIG.newCategoryWeight
  const status = classifyMastery(row.total_answered, row.ema_score)
  const due = status === 'mastered' && row.last_answered_at
    ? isDueForRefresh(new Date(row.last_answered_at), row.refresh_interval_days, now)
    : false
  return categoryWeight(status, row.ema_score, due)
}
