// ============================================================
// Study Plan report
//
// Pure functions: a finished plan's answers in, display-ready numbers out, so
// the whole report is unit-testable without Supabase (same split as
// dashboard/metrics.ts). src/app/(dashboard)/paths/[pathId]/report/page.tsx
// does the fetching.
//
// Topics are the 11 handbook sections, not the ~74 categories: most categories
// have only a handful of answers in one plan, which makes a percentage noisy.
// The tone is a coach's: a result is only shown when it is trustworthy, and a
// weak spot is always "next to sharpen", never a verdict on the person.
// ============================================================

import { HANDBOOK_SECTIONS, SECTION_CATEGORIES } from '@/lib/constants'
import { DASHBOARD_CONFIG, shortDate } from '@/lib/dashboard/metrics'
import { MASTERY_CONFIG } from '@/lib/quiz/mastery'
import { calendarDay, localDateString } from '@/lib/quiz/paths'

const MS_PER_DAY = 86_400_000

export const REPORT_CONFIG = {
  /** The second half must beat the first by this many points for the report to mention a trend at all. */
  minTrendGainPoints: 3,
  /** Each half needs this many answers before a before/after comparison is fair. */
  minAnswersPerHalf: 20,
  /** At most this many sections are called out as the place to focus. */
  focusSectionLimit: 2,
  /** Fewer missed questions than this and practising weak sections leads, not retaking. */
  fewMisses: 5,
  retake: { step: 5, max: 35, preferred: 10 },
} as const

/** Missing at least this many questions turns the retake into a study plan; fewer is a quick quiz. */
export const RETAKE_PLAN_MIN_MISSED = 20

/** What a retake plan starts with on the Create a Study Plan page. */
export const RETAKE_PLAN_DEFAULTS = { questionsPerDay: 10, daysPerWeek: 3 } as const

export interface ReportAnswer {
  questionId: string
  sessionId: string
  isCorrect: boolean
  answeredAt: string
}

// ---------- timing ----------

export interface PathTiming {
  kind: 'early' | 'on-time' | 'late'
  /** Whole calendar days between finishing and the due date. 0 when on the due date. */
  days: number
  /** The plan's due date, YYYY-MM-DD. */
  dueDate: string
}

/** Finished early, on the due date, or late — judged by calendar day in the viewer's time zone. */
export function pathTiming(finishedAt: Date, targetEndDate: Date, timeZone: string): PathTiming {
  const diff = Math.round((targetEndDate.getTime() - calendarDay(finishedAt, timeZone).getTime()) / MS_PER_DAY)
  return {
    kind: diff > 0 ? 'early' : diff === 0 ? 'on-time' : 'late',
    days: Math.abs(diff),
    dueDate: targetEndDate.toISOString().slice(0, 10),
  }
}

/** The plain sentence for the celebration and the report. States the timing; never apologises for it. */
export function describeTiming(timing: PathTiming): string {
  const due = shortDate(timing.dueDate)
  const days = `${timing.days} day${timing.days === 1 ? '' : 's'}`
  if (timing.kind === 'early') return `Finished ${days} before your ${due} due date.`
  if (timing.kind === 'on-time') return `Finished on your ${due} due date.`
  return `Finished ${days} after your ${due} due date.`
}

// ---------- sections ----------

/** 'unrated' means too few answers in the section for a percentage to mean anything. */
export type SectionTier = 'strong' | 'solid' | 'building' | 'unrated'

export const TIER_LABEL: Record<SectionTier, string> = {
  strong: 'Strong',
  solid: 'Solid',
  building: 'Building',
  unrated: 'Too few questions to rate',
}

export interface SectionResult {
  section: string
  answered: number
  correct: number
  /** 0..1, or null when `unrated`. */
  accuracy: number | null
  tier: SectionTier
}

const SECTION_BY_CATEGORY = new Map<string, string>(
  HANDBOOK_SECTIONS.flatMap((section) => SECTION_CATEGORIES[section].map((category) => [category, section] as const))
)

function tierFor(accuracy: number | null): SectionTier {
  if (accuracy === null) return 'unrated'
  if (accuracy >= MASTERY_CONFIG.masteredFloor) return 'strong'
  if (accuracy >= MASTERY_CONFIG.developingCeiling) return 'solid'
  return 'building'
}

// ---------- the report ----------

export interface PathReport {
  /** The calendar day (YYYY-MM-DD, viewer's time zone) of the final answer. Null for a plan with no answers. */
  finishedOn: string | null
  timing: PathTiming | null
  questionsCovered: number
  totalAnswers: number
  /** 0..1 over every answer given in the plan, or null with no answers. */
  accuracy: number | null
  studyDays: number
  /** Whole-number percentages. Only present when accuracy clearly improved; a flat or falling trend is never shown. */
  trend: { from: number; to: number } | null
  /** Sections the plan touched, in handbook order. */
  sections: SectionResult[]
  /** Up to two rated sections below the "strong" line, lowest first. Empty when every rated section is strong. */
  focusSections: SectionResult[]
  /** The quiz holding the final answer — its results page is the review of the last questions. */
  finalSessionId: string | null
}

export function buildPathReport(input: {
  answers: ReportAnswer[]
  /** Category of each question in the plan's pool. */
  categoryByQuestionId: Map<string, string>
  targetEndDate: Date
  timeZone: string
}): PathReport {
  const { categoryByQuestionId, targetEndDate, timeZone } = input
  const answers = [...input.answers].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt))
  const last = answers[answers.length - 1]
  const correctCount = answers.filter((a) => a.isCorrect).length

  const accuracyOf = (list: ReportAnswer[]) => (list.length === 0 ? null : list.filter((a) => a.isCorrect).length / list.length)

  const half = Math.floor(answers.length / 2)
  const first = answers.slice(0, half)
  const second = answers.slice(half)
  let trend: PathReport['trend'] = null
  if (first.length >= REPORT_CONFIG.minAnswersPerHalf && second.length >= REPORT_CONFIG.minAnswersPerHalf) {
    const from = Math.round(accuracyOf(first)! * 100)
    const to = Math.round(accuracyOf(second)! * 100)
    if (to - from >= REPORT_CONFIG.minTrendGainPoints) trend = { from, to }
  }

  const tally = new Map<string, { answered: number; correct: number }>()
  for (const a of answers) {
    const section = SECTION_BY_CATEGORY.get(categoryByQuestionId.get(a.questionId) ?? '')
    if (!section) continue
    const t = tally.get(section) ?? { answered: 0, correct: 0 }
    t.answered++
    if (a.isCorrect) t.correct++
    tally.set(section, t)
  }
  const sections: SectionResult[] = HANDBOOK_SECTIONS.filter((s) => tally.has(s)).map((section) => {
    const { answered, correct } = tally.get(section)!
    const accuracy = answered >= DASHBOARD_CONFIG.minAnswersForAccuracy ? correct / answered : null
    return { section, answered, correct, accuracy, tier: tierFor(accuracy) }
  })

  const focusSections = sections
    .filter((s) => s.accuracy !== null && s.tier !== 'strong')
    .sort((a, b) => a.accuracy! - b.accuracy!)
    .slice(0, REPORT_CONFIG.focusSectionLimit)

  return {
    finishedOn: last ? localDateString(new Date(last.answeredAt), timeZone) : null,
    timing: last ? pathTiming(new Date(last.answeredAt), targetEndDate, timeZone) : null,
    questionsCovered: new Set(answers.map((a) => a.questionId)).size,
    totalAnswers: answers.length,
    accuracy: answers.length === 0 ? null : correctCount / answers.length,
    studyDays: new Set(answers.map((a) => localDateString(new Date(a.answeredAt), timeZone))).size,
    trend,
    sections,
    focusSections,
    finalSessionId: last?.sessionId ?? null,
  }
}

// ---------- still missed ----------

export interface MissedQuestion {
  questionId: string
  /** Times it was answered wrongly within the plan — how stubborn it has been. */
  misses: number
}

/**
 * Pool questions whose most recent answer (in the plan or in later practice) was
 * wrong. A question missed once in the plan and answered correctly since is
 * resolved, so this shrinks as the user retakes them.
 */
export function stillMissedQuestions(input: {
  poolQuestionIds: string[]
  /** Each question's latest answer from any quiz. */
  latestAnswers: Map<string, { isCorrect: boolean }>
  planAnswers: ReportAnswer[]
}): MissedQuestion[] {
  const planMisses = new Map<string, number>()
  for (const a of input.planAnswers) if (!a.isCorrect) planMisses.set(a.questionId, (planMisses.get(a.questionId) ?? 0) + 1)

  const missed: MissedQuestion[] = []
  for (const questionId of input.poolQuestionIds) {
    const latest = input.latestAnswers.get(questionId)
    if (latest && !latest.isCorrect) missed.push({ questionId, misses: Math.max(1, planMisses.get(questionId) ?? 0) })
  }
  return missed
}

// ---------- what's next ----------

export interface NextSteps {
  /** 'none' is a clean sweep: nothing to retake. */
  retake: 'primary' | 'secondary' | 'none'
  /** A study plan for a lot of missed questions, a one-click quick quiz for a handful. */
  retakeFormat: 'plan' | 'quiz' | 'none'
  /** Which section quizzes to offer, or a mixed quiz when no section needs attention. */
  practice: 'weakest' | 'mixed'
  practiceCategories: string[]
  practiceSections: string[]
}

export function nextSteps(missedCount: number, focusSections: SectionResult[]): NextSteps {
  const practiceSections = focusSections.map((s) => s.section)
  return {
    retake: missedCount === 0 ? 'none' : missedCount >= REPORT_CONFIG.fewMisses ? 'primary' : 'secondary',
    retakeFormat: missedCount === 0 ? 'none' : missedCount >= RETAKE_PLAN_MIN_MISSED ? 'plan' : 'quiz',
    practice: focusSections.length > 0 ? 'weakest' : 'mixed',
    practiceCategories: practiceSections.flatMap((s) => [...SECTION_CATEGORIES[s as (typeof HANDBOOK_SECTIONS)[number]]]),
    practiceSections,
  }
}

/**
 * The quiz sizes the retake stepper offers: 5, 10, 15 ... up to 35, never more
 * than the questions actually missed, with "all of them" as the last step when
 * that is a smaller number than 35. A single entry means there is nothing to choose.
 */
export function retakeSizeOptions(missedCount: number): number[] {
  const { step, max } = REPORT_CONFIG.retake
  const ceiling = Math.min(max, missedCount)
  const options: number[] = []
  for (let n = step; n <= ceiling; n += step) options.push(n)
  if (ceiling > 0 && options[options.length - 1] !== ceiling) options.push(ceiling)
  return options
}

/** Starts at 10 when offered, otherwise at the most that can be taken. */
export function defaultRetakeSize(options: number[]): number {
  if (options.includes(REPORT_CONFIG.retake.preferred)) return REPORT_CONFIG.retake.preferred
  return options[options.length - 1] ?? 0
}
