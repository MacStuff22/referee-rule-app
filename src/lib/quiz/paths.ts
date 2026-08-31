// ============================================================
// Quiz Path pacing
//
// Pure date/count math for goal-based study plans (e.g. "Situation Book
// in 3 months"). computeQuestionsPerDay and computeTargetEndDate are the
// two entry points a plan can be created from — pick a deadline, or pick
// a pace, and the other side is computed. reflowPace recomputes the pace
// whenever a plan is revisited, so a missed day doesn't silently fall
// off track; it's capped so a bad week extends the deadline instead of
// spiking the daily count into something demoralizing.
// reservedCoverageSlots is what guarantees every question in a path's
// pool gets covered by the deadline even though most days are otherwise
// weakness-weighted (see the paths/[pathId]/start route).
// ============================================================

export const PATH_CONFIG = {
  reflowCeilingMultiplier: 2,
} as const

const MS_PER_DAY = 86_400_000

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY)
}

export function scheduledDaysBetween(startDate: Date, endDate: Date, daysPerWeek: number): number {
  const totalDays = Math.max(1, daysBetween(startDate, endDate))
  return Math.max(1, Math.round(totalDays * (daysPerWeek / 7)))
}

/**
 * Like scheduledDaysBetween, but allowed to reach 0 (not floored to 1) once
 * `today` has reached or passed the deadline — that's what tells reflowPace
 * and reservedCoverageSlots to cram everything remaining into today rather
 * than dividing by a phantom day.
 */
export function remainingScheduledDays(today: Date, targetEndDate: Date, daysPerWeek: number): number {
  const daysLeft = Math.max(0, daysBetween(today, targetEndDate))
  return Math.round(daysLeft * (daysPerWeek / 7))
}

export function computeQuestionsPerDay(
  poolSize: number,
  startDate: Date,
  targetEndDate: Date,
  daysPerWeek: number
): number {
  const scheduledDays = scheduledDaysBetween(startDate, targetEndDate, daysPerWeek)
  return Math.max(1, Math.ceil(poolSize / scheduledDays))
}

export function computeTargetEndDate(
  poolSize: number,
  questionsPerDay: number,
  startDate: Date,
  daysPerWeek: number
): Date {
  const scheduledDaysNeeded = Math.ceil(poolSize / Math.max(1, questionsPerDay))
  const totalDays = Math.ceil(scheduledDaysNeeded * (7 / daysPerWeek))
  return new Date(startDate.getTime() + totalDays * MS_PER_DAY)
}

export interface ReflowResult {
  questionsPerDay: number
  extendEndDate: boolean
}

export function reflowPace(
  remainingPoolSize: number,
  remainingScheduledDays: number,
  currentQuestionsPerDay: number
): ReflowResult {
  if (remainingPoolSize <= 0) return { questionsPerDay: currentQuestionsPerDay, extendEndDate: false }
  const ceiling = currentQuestionsPerDay * PATH_CONFIG.reflowCeilingMultiplier
  const needed = Math.ceil(remainingPoolSize / Math.max(1, remainingScheduledDays))
  if (needed <= ceiling) return { questionsPerDay: needed, extendEndDate: false }
  return { questionsPerDay: ceiling, extendEndDate: true }
}

export function reservedCoverageSlots(
  uncoveredCount: number,
  remainingScheduledDays: number,
  todaysTotalSlots: number
): number {
  if (uncoveredCount <= 0) return 0
  if (remainingScheduledDays <= 0) return Math.min(uncoveredCount, todaysTotalSlots)
  return Math.min(todaysTotalSlots, Math.ceil(uncoveredCount / remainingScheduledDays))
}
