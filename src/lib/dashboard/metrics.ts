// ============================================================
// Dashboard metrics
//
// Pure functions: plain arrays + a `now` in, display-ready numbers out, so
// everything here is unit-testable without Supabase (same split as
// mastery.ts). src/lib/dashboard/data.ts does the fetching.
//
// Every "day" is an Eastern Time calendar day (DASHBOARD_TIMEZONE) so a
// late-evening quiz counts for the day the user actually studied on, not
// the UTC day Vercel's servers happen to be in.
// ============================================================

import { CATEGORIES, SECTION_CATEGORIES, HANDBOOK_SECTIONS } from '@/lib/constants'
import { classifyMastery, isDueForRefresh, MASTERY_CONFIG, type MasteryStatus } from '@/lib/quiz/mastery'

export const DASHBOARD_TIMEZONE = 'America/New_York'

export const DASHBOARD_CONFIG = {
  /** Windows with fewer answers than this show "not enough data yet" instead of a noisy percentage. */
  minAnswersForAccuracy: 10,
  minAnswersForTrendPoint: 5,
  trendPoints: 7,
  trendStepDays: 14,
  goalAccuracy: MASTERY_CONFIG.masteredFloor,
  coverageWindowDays: 90,
  readinessWeights: { accuracy: 0.5, coverage: 0.25, freshness: 0.25 },
  weeklyGoalDays: 4,
  calendarWeeks: 12,
  studyPlanSize: 5,
  recentAnswersForReason: 7,
  missedQuestionMinMisses: 2,
  missedQuestionLimit: 3,
  questionMilestones: [100, 250, 500, 1000],
  bestWeekMinAnswers: 20,
} as const

const DAY_MS = 86_400_000

export interface AnswerRecord {
  questionId: string
  sessionId: string
  isCorrect: boolean
  answeredAt: string
}

export interface QuestionMeta {
  id: string
  text: string
  category: string
  ruleReferences: string[]
}

export interface MasteryInfo {
  category: string
  emaScore: number
  totalAnswered: number
  lastAnsweredAt: string | null
  refreshIntervalDays: number
}

// ---------- day helpers (Eastern Time) ----------

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DASHBOARD_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 'YYYY-MM-DD' of the Eastern Time calendar day containing this instant. */
export function dayKey(date: Date): string {
  return dayFormatter.format(date)
}

function keyToUtc(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function utcToKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(key: string, days: number): string {
  return utcToKey(keyToUtc(key) + days * DAY_MS)
}

/** 0 = Monday … 6 = Sunday. */
function weekdayIndex(key: string): number {
  return (new Date(keyToUtc(key)).getUTCDay() + 6) % 7
}

export function weekStart(key: string): string {
  return addDays(key, -weekdayIndex(key))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function shortDate(key: string): string {
  const [, m, d] = key.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS)
}

function sortedAnswers(answers: AnswerRecord[]): AnswerRecord[] {
  return [...answers].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt))
}

// ---------- accuracy ----------

export interface WindowAccuracy {
  correct: number
  total: number
  /** 0..1, or null when the window is too small to trust. */
  accuracy: number | null
}

function accuracyInWindow(answers: AnswerRecord[], from: number, to: number, minAnswers: number): WindowAccuracy {
  let correct = 0
  let total = 0
  for (const a of answers) {
    const t = new Date(a.answeredAt).getTime()
    if (t > from && t <= to) {
      total++
      if (a.isCorrect) correct++
    }
  }
  return { correct, total, accuracy: total >= minAnswers ? correct / total : null }
}

export interface Last30Days {
  current: WindowAccuracy
  previous: WindowAccuracy
  /** Percentage points, current minus previous; null unless both windows have enough answers. */
  deltaPoints: number | null
}

export function last30Days(answers: AnswerRecord[], now: Date): Last30Days {
  const end = now.getTime()
  const min = DASHBOARD_CONFIG.minAnswersForAccuracy
  const current = accuracyInWindow(answers, end - 30 * DAY_MS, end, min)
  const previous = accuracyInWindow(answers, end - 60 * DAY_MS, end - 30 * DAY_MS, min)
  const deltaPoints =
    current.accuracy !== null && previous.accuracy !== null
      ? Math.round((current.accuracy - previous.accuracy) * 100)
      : null
  return { current, previous, deltaPoints }
}

export interface TrendPoint {
  /** Date the window ends on, e.g. "Oct 1". */
  label: string
  accuracy: number | null
  total: number
  /** Percentage points vs the previous point that had data. */
  deltaPoints: number | null
}

/** One point every two weeks: accuracy over the 14 days ending at that point. Oldest first. */
export function biweeklyTrend(answers: AnswerRecord[], now: Date): TrendPoint[] {
  const { trendPoints, trendStepDays, minAnswersForTrendPoint } = DASHBOARD_CONFIG
  const points: TrendPoint[] = []
  let prev: number | null = null
  for (let i = trendPoints - 1; i >= 0; i--) {
    const end = new Date(now.getTime() - i * trendStepDays * DAY_MS)
    const w = accuracyInWindow(answers, end.getTime() - trendStepDays * DAY_MS, end.getTime(), minAnswersForTrendPoint)
    const delta = w.accuracy !== null && prev !== null ? Math.round((w.accuracy - prev) * 100) : null
    points.push({ label: shortDate(dayKey(end)), accuracy: w.accuracy, total: w.total, deltaPoints: delta })
    if (w.accuracy !== null) prev = w.accuracy
  }
  return points
}

// ---------- coverage ----------

export interface Coverage {
  totalQuestions: number
  seenRolling: number
  seenAllTime: number
  totalTopics: number
  topicsRolling: number
  topicsMastered: number
}

export function coverage(
  answers: AnswerRecord[],
  questions: QuestionMeta[],
  masteries: MasteryInfo[],
  now: Date
): Coverage {
  const byId = new Map(questions.map((q) => [q.id, q]))
  const cutoff = now.getTime() - DASHBOARD_CONFIG.coverageWindowDays * DAY_MS
  const seenAll = new Set<string>()
  const seenRolling = new Set<string>()
  const topicsRolling = new Set<string>()
  for (const a of answers) {
    const q = byId.get(a.questionId)
    if (!q) continue // question since unapproved/deleted
    seenAll.add(a.questionId)
    if (new Date(a.answeredAt).getTime() > cutoff) {
      seenRolling.add(a.questionId)
      topicsRolling.add(q.category)
    }
  }
  const topicsMastered = masteries.filter(
    (m) => classifyMastery(m.totalAnswered, m.emaScore) === 'mastered'
  ).length
  return {
    totalQuestions: questions.length,
    seenRolling: seenRolling.size,
    seenAllTime: seenAll.size,
    totalTopics: new Set(questions.map((q) => q.category)).size,
    topicsRolling: topicsRolling.size,
    topicsMastered,
  }
}

// ---------- readiness ----------

export type ReadinessLabel = 'Getting Started' | 'Building' | 'On Track' | 'Exam Ready'

export interface Readiness {
  /** 0..100, or null when there is not enough recent data. */
  score: number | null
  label: ReadinessLabel | null
  accuracy: number | null
  coverage: number
  /** 0..1 share of started topics still inside their review window; null if none started. */
  freshness: number | null
  /** Topics past their review window — the plain-English "what's holding you back". */
  staleTopics: number
}

export function freshness(masteries: MasteryInfo[], now: Date): { share: number | null; stale: number } {
  const started = masteries.filter((m) => m.totalAnswered > 0 && m.lastAnsweredAt)
  if (started.length === 0) return { share: null, stale: 0 }
  const stale = started.filter((m) => isDueForRefresh(new Date(m.lastAnsweredAt!), m.refreshIntervalDays, now)).length
  return { share: (started.length - stale) / started.length, stale }
}

export function readinessLabel(score: number): ReadinessLabel {
  if (score < 40) return 'Getting Started'
  if (score < 60) return 'Building'
  if (score < 80) return 'On Track'
  return 'Exam Ready'
}

export function readiness(
  last30: Last30Days,
  cov: Coverage,
  masteries: MasteryInfo[],
  now: Date
): Readiness {
  const fresh = freshness(masteries, now)
  const coverageShare = cov.totalQuestions > 0 ? cov.seenRolling / cov.totalQuestions : 0
  const accuracy = last30.current.accuracy
  if (accuracy === null) {
    return { score: null, label: null, accuracy: null, coverage: coverageShare, freshness: fresh.share, staleTopics: fresh.stale }
  }
  const w = DASHBOARD_CONFIG.readinessWeights
  // With no started topics there is nothing to be fresh or stale, so score on the other two parts alone
  // rather than counting "no data" as 0% fresh.
  const raw =
    fresh.share === null
      ? (w.accuracy * accuracy + w.coverage * coverageShare) / (w.accuracy + w.coverage)
      : w.accuracy * accuracy + w.coverage * coverageShare + w.freshness * fresh.share
  const score = Math.round(raw * 100)
  return { score, label: readinessLabel(score), accuracy, coverage: coverageShare, freshness: fresh.share, staleTopics: fresh.stale }
}

// ---------- study plan ----------

export type StudyPlanKind = 'weak' | 'fading' | 'new'

export interface StudyPlanItem {
  category: string
  kind: StudyPlanKind
  /** Plain-English reason shown under the topic name. */
  reason: string
  /** Rule references most often missed in this topic, e.g. ["84.4", "84.2"]. */
  rules: string[]
}

function agoText(days: number): string {
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`
  const weeks = Math.round(days / 7)
  return `${weeks} weeks ago`
}

export function studyPlan(
  answers: AnswerRecord[],
  questions: QuestionMeta[],
  masteries: MasteryInfo[],
  now: Date
): StudyPlanItem[] {
  const byId = new Map(questions.map((q) => [q.id, q]))
  const masteryByCat = new Map(masteries.map((m) => [m.category, m]))
  const categoriesWithQuestions = new Set(questions.map((q) => q.category))

  // answers per category, newest first
  const byCategory = new Map<string, AnswerRecord[]>()
  for (const a of sortedAnswers(answers).reverse()) {
    const q = byId.get(a.questionId)
    if (!q) continue
    const list = byCategory.get(q.category) ?? []
    list.push(a)
    byCategory.set(q.category, list)
  }

  const candidates: (StudyPlanItem & { priority: number })[] = []
  for (const category of CATEGORIES) {
    if (!categoriesWithQuestions.has(category)) continue
    const m = masteryByCat.get(category)
    const status: MasteryStatus = m ? classifyMastery(m.totalAnswered, m.emaScore) : 'new'

    const recent = (byCategory.get(category) ?? []).slice(0, DASHBOARD_CONFIG.recentAnswersForReason)
    const rules = topMissedRules(recent, byId)

    if (status === 'developing' && m) {
      const missed = recent.filter((a) => !a.isCorrect).length
      const reason =
        recent.length >= 3
          ? `Missed ${missed} of your last ${recent.length}`
          : `Scoring ${Math.round(m.emaScore * 100)}% lately`
      candidates.push({ category, kind: 'weak', reason, rules, priority: 1000 + (1 - m.emaScore) * 100 })
    } else if (status === 'new') {
      candidates.push({ category, kind: 'new', reason: "You haven't seen any questions here yet", rules: [], priority: 100 })
    } else if (m && m.lastAnsweredAt && isDueForRefresh(new Date(m.lastAnsweredAt), m.refreshIntervalDays, now)) {
      const days = daysSince(m.lastAnsweredAt, now)
      candidates.push({ category, kind: 'fading', reason: `Last practiced ${agoText(days)}`, rules, priority: 500 + days })
    }
  }
  return candidates
    .sort((a, b) => b.priority - a.priority)
    .slice(0, DASHBOARD_CONFIG.studyPlanSize)
    .map(({ category, kind, reason, rules }) => ({ category, kind, reason, rules }))
}

function topMissedRules(recent: AnswerRecord[], byId: Map<string, QuestionMeta>): string[] {
  const counts = new Map<string, number>()
  for (const a of recent) {
    if (a.isCorrect) continue
    for (const ref of byId.get(a.questionId)?.ruleReferences ?? []) counts.set(ref, (counts.get(ref) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([ref]) => ref)
}

// ---------- strengths map ----------

export type TileStatus = MasteryStatus

export interface StrengthSection {
  section: string
  tiles: { category: string; status: TileStatus }[]
}

export function strengthMap(masteries: MasteryInfo[], questions: QuestionMeta[]): StrengthSection[] {
  const masteryByCat = new Map(masteries.map((m) => [m.category, m]))
  const withQuestions = new Set(questions.map((q) => q.category))
  return HANDBOOK_SECTIONS.map((section) => ({
    section,
    tiles: SECTION_CATEGORIES[section]
      .filter((c) => withQuestions.has(c))
      .map((category) => {
        const m = masteryByCat.get(category)
        return { category, status: m ? classifyMastery(m.totalAnswered, m.emaScore) : ('new' as TileStatus) }
      }),
  })).filter((s) => s.tiles.length > 0)
}

// ---------- momentum ----------

export interface CalendarCell {
  key: string
  day: number
  /** 0 none, 1 a little, 2 solid, 3 big day. */
  level: 0 | 1 | 2 | 3
  isToday: boolean
  isFuture: boolean
}

export interface CalendarWeek {
  label: string
  cells: CalendarCell[]
}

export interface Momentum {
  streak: number
  /** True when a missed day inside the last week was forgiven to keep the streak alive. */
  restDayUsed: boolean
  weekDaysDone: number
  weeklyGoal: number
  /** Mon..Sun for the current week. */
  week: { key: string; done: boolean; isToday: boolean; isFuture: boolean }[]
  calendar: CalendarWeek[]
}

export function dailyCounts(answers: AnswerRecord[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const a of answers) {
    const k = dayKey(new Date(a.answeredAt))
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return counts
}

function levelFor(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0
  if (count < 7) return 1
  if (count < 17) return 2
  return 3
}

/**
 * Consecutive study days, forgiving one missed day per rolling week. Today not
 * being done yet never breaks the streak — the day isn't over.
 */
export function forgivingStreak(counts: Map<string, number>, today: string): { streak: number; restDayUsed: boolean } {
  let cursor = counts.get(today) ? today : addDays(today, -1)
  let streak = 0
  let lastForgivenAt = Infinity // days walked back since the last forgiven miss
  let restDayUsed = false
  let walked = 0
  // A streak can't be longer than the data; bound the walk.
  for (let guard = 0; guard < 3650; guard++) {
    if (counts.get(cursor)) {
      streak++
    } else if (lastForgivenAt >= 7 && counts.get(addDays(cursor, -1))) {
      // forgive this single miss only if the day before it was a study day
      lastForgivenAt = 0
      if (walked < 7) restDayUsed = true
    } else {
      break
    }
    cursor = addDays(cursor, -1)
    walked++
    lastForgivenAt++
  }
  return { streak, restDayUsed }
}

export function momentum(answers: AnswerRecord[], now: Date): Momentum {
  const counts = dailyCounts(answers)
  const today = dayKey(now)
  const { streak, restDayUsed } = forgivingStreak(counts, today)

  const thisWeekStart = weekStart(today)
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(thisWeekStart, i)
    return { key, done: (counts.get(key) ?? 0) > 0, isToday: key === today, isFuture: key > today }
  })

  const calendar: CalendarWeek[] = []
  for (let w = DASHBOARD_CONFIG.calendarWeeks - 1; w >= 0; w--) {
    const start = addDays(thisWeekStart, -7 * w)
    calendar.push({
      label: shortDate(start),
      cells: Array.from({ length: 7 }, (_, i) => {
        const key = addDays(start, i)
        const isFuture = key > today
        return {
          key,
          day: Number(key.slice(8)),
          level: isFuture ? 0 : levelFor(counts.get(key) ?? 0),
          isToday: key === today,
          isFuture,
        }
      }),
    })
  }

  return {
    streak,
    restDayUsed,
    weekDaysDone: week.filter((d) => d.done).length,
    weeklyGoal: DASHBOARD_CONFIG.weeklyGoalDays,
    week,
    calendar,
  }
}

// ---------- missed questions ----------

export interface MissedQuestion {
  questionId: string
  text: string
  category: string
  rule: string | null
  misses: number
  /** Session whose results page shows the answer review for the latest miss. */
  lastSessionId: string
}

export function missedQuestions(answers: AnswerRecord[], questions: QuestionMeta[]): MissedQuestion[] {
  const byId = new Map(questions.map((q) => [q.id, q]))
  const grouped = new Map<string, AnswerRecord[]>()
  for (const a of sortedAnswers(answers)) {
    if (!byId.has(a.questionId)) continue
    const list = grouped.get(a.questionId) ?? []
    list.push(a)
    grouped.set(a.questionId, list)
  }
  const out: (MissedQuestion & { lastAt: string })[] = []
  for (const [questionId, list] of grouped) {
    const misses = list.filter((a) => !a.isCorrect).length
    const latest = list[list.length - 1]
    // Only questions still being missed: a later correct answer means it's resolved.
    if (misses < DASHBOARD_CONFIG.missedQuestionMinMisses || latest.isCorrect) continue
    const q = byId.get(questionId)!
    out.push({
      questionId,
      text: q.text,
      category: q.category,
      rule: q.ruleReferences[0] ?? null,
      misses,
      lastSessionId: latest.sessionId,
      lastAt: latest.answeredAt,
    })
  }
  return out
    .sort((a, b) => b.misses - a.misses || b.lastAt.localeCompare(a.lastAt))
    .slice(0, DASHBOARD_CONFIG.missedQuestionLimit)
    .map(({ questionId, text, category, rule, misses, lastSessionId }) => ({
      questionId,
      text,
      category,
      rule,
      misses,
      lastSessionId,
    }))
}

// ---------- milestones ----------

export interface Badge {
  id: string
  title: string
  detail: string
}

export interface Milestones {
  earned: Badge[]
  next: { title: string; current: number; target: number } | null
}

export function milestones(answers: AnswerRecord[], masteries: MasteryInfo[]): Milestones {
  const sorted = sortedAnswers(answers)
  const earned: Badge[] = []

  let nextTarget: number | null = null
  for (const target of DASHBOARD_CONFIG.questionMilestones) {
    const reached = sorted[target - 1]
    if (reached) {
      earned.push({
        id: `q${target}`,
        title: `First ${target} questions`,
        detail: `Earned ${shortDate(dayKey(new Date(reached.answeredAt)))}`,
      })
    } else if (nextTarget === null) {
      nextTarget = target
    }
  }

  // Best week: highest accuracy over a Mon–Sun week with enough answers.
  const weeks = new Map<string, { correct: number; total: number }>()
  for (const a of sorted) {
    const k = weekStart(dayKey(new Date(a.answeredAt)))
    const w = weeks.get(k) ?? { correct: 0, total: 0 }
    w.total++
    if (a.isCorrect) w.correct++
    weeks.set(k, w)
  }
  let best: { key: string; accuracy: number } | null = null
  for (const [key, w] of weeks) {
    if (w.total < DASHBOARD_CONFIG.bestWeekMinAnswers) continue
    const accuracy = w.correct / w.total
    if (!best || accuracy > best.accuracy) best = { key, accuracy }
  }
  if (best) {
    earned.push({
      id: 'best-week',
      title: `Best week: ${Math.round(best.accuracy * 100)}%`,
      detail: `Week of ${shortDate(best.key)}`,
    })
  }

  const mastered = masteries
    .filter((m) => classifyMastery(m.totalAnswered, m.emaScore) === 'mastered')
    .map((m) => m.category)
  for (const category of mastered.slice(0, 3)) {
    earned.push({ id: `mastered-${category}`, title: `${category} mastered`, detail: 'Currently mastered' })
  }

  return {
    earned,
    next: nextTarget === null ? null : { title: `${nextTarget} questions`, current: sorted.length, target: nextTarget },
  }
}
