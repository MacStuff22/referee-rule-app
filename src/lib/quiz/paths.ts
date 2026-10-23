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
// computePace answers "where should you be by now?" as a straight line
// from the start to the deadline. It deliberately ignores the stored
// questions_per_day: reflowPace rewrites that on every daily quiz, so
// multiplying it by the days already elapsed rewrites history (it pinned
// the marker at 100% nine days before a deadline).
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

export type PaceStatus = 'ahead' | 'on-track' | 'due-today' | 'behind'

export interface PaceInput {
  poolSize: number
  coveredCount: number
  startDate: Date
  targetEndDate: Date
  daysPerWeek: number
  today: Date
}

export interface PaceResult {
  /** Questions that should be covered by now on an even pace from the start to the deadline. */
  expectedCount: number
  /** What should have been covered through yesterday — falling short of this is a genuine miss. */
  expectedByYesterday: number
  expectedPercent: number
  status: PaceStatus
}

/**
 * Straight-line pace: the pool spread evenly over the plan's scheduled study
 * days. Counting is in whole scheduled days (the same unit reflowPace and
 * computeQuestionsPerDay use), floored, so being a fraction of a question
 * short of the line never reads as behind.
 *
 * The gap between expectedByYesterday and expectedCount is just today's
 * still-open share, so it reads "due-today" rather than "behind" until a full
 * day has actually been missed.
 */
export function computePace({ poolSize, coveredCount, startDate, targetEndDate, daysPerWeek, today }: PaceInput): PaceResult {
  const total = scheduledDaysBetween(startDate, targetEndDate, daysPerWeek)
  const elapsed = (at: Date) =>
    at >= targetEndDate ? total : at > startDate ? scheduledDaysBetween(startDate, at, daysPerWeek) : 0
  // Multiply before dividing: dividing first mis-floors on floating point.
  const expectedAfter = (steps: number) => Math.min(poolSize, Math.floor((poolSize * steps) / total))

  const expectedCount = expectedAfter(elapsed(today))
  const expectedByYesterday = expectedAfter(elapsed(new Date(today.getTime() - MS_PER_DAY)))

  let status: PaceStatus
  if (coveredCount >= expectedCount) {
    status = coveredCount > expectedCount * 1.1 ? 'ahead' : 'on-track'
  } else if (coveredCount >= expectedByYesterday) {
    status = 'due-today'
  } else {
    status = 'behind'
  }

  return {
    expectedCount,
    expectedByYesterday,
    expectedPercent: poolSize > 0 ? Math.round((expectedCount / poolSize) * 100) : 0,
    status,
  }
}
