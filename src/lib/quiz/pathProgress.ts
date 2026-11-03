// ============================================================
// Quiz Path progress
//
// Derived entirely from existing quiz_sessions/quiz_answers rows tagged
// with a path_id — no separate progress-tracking table (see the
// migration file's rationale). Shared by the paths list and a path's
// own detail page so the two can't disagree on coverage/pace.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { computePace, planTodaysQuiz, remainingScheduledDays, type PaceStatus } from '@/lib/quiz/paths'
import { fetchLivePoolQuestions } from '@/lib/quiz/pool'
import { DEFAULT_PLAN_TIME_ZONE } from '@/lib/timeZone'
import type { QuizPath } from '@/types'

export type { PaceStatus }

export interface PathProgress {
  poolSize: number
  coveredCount: number
  percent: number
  paceStatus: PaceStatus
  /** Questions you'd have covered by today on an even pace from the start to the deadline — drives the pace marker on the progress bar. */
  expectedCount: number
  expectedPercent: number
  /** How many questions a quiz started right now will have — the same calculation the quiz builder uses. */
  todaysQuestions: number
}

export const PACE_LABEL: Record<PaceStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  ahead: { label: 'Ahead of pace', variant: 'default' },
  'on-track': { label: 'On track', variant: 'secondary' },
  'due-today': { label: "On track — complete today's questions", variant: 'secondary' },
  behind: { label: 'Behind pace', variant: 'destructive' },
  'past-due': { label: 'Past due', variant: 'destructive' },
}

export interface PathAnswerRecord {
  questionId: string
  sessionId: string
  isCorrect: boolean
  answeredAt: string
}

// Supabase returns at most 1000 rows per request, so anything that reads a
// whole answer history has to page through it. A plan that repeats questions
// can pass 1000 answers, and a silently cut-off list would read as "not done".
const ANSWER_PAGE_SIZE = 1000

type AnswerRow = Record<string, unknown>

async function fetchAllRows(
  page: (from: number, to: number) => PromiseLike<{ data: AnswerRow[] | null; error: { message: string } | null }>,
  failure: string
): Promise<AnswerRow[]> {
  const rows: AnswerRow[] = []
  for (let from = 0; ; from += ANSWER_PAGE_SIZE) {
    const { data, error } = await page(from, from + ANSWER_PAGE_SIZE - 1)
    if (error) throw new Error(`${failure}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < ANSWER_PAGE_SIZE) break
  }
  return rows
}

function toAnswerRecord(row: AnswerRow): PathAnswerRecord {
  return {
    questionId: row.question_id as string,
    sessionId: row.session_id as string,
    isCorrect: row.is_correct as boolean,
    answeredAt: row.answered_at as string,
  }
}

/**
 * Every question this user has actually answered within this path, in the
 * order they answered it — independent of whether the session that
 * presented it was ever marked complete. This is the real source of truth
 * for "covered": a session's `question_ids` only reflects what was ever
 * *assigned* to it, and an early exit (see quiz/[sessionId]/page.tsx's
 * handleExit) still marks the session `completed_at` without having shown
 * the user the rest of that list.
 */
export async function getPathAnswers(
  supabase: SupabaseClient,
  pathId: string,
  userId: string
): Promise<PathAnswerRecord[]> {
  const rows = await fetchAllRows(
    (from, to) =>
      supabase
        .from('quiz_answers')
        .select('id, question_id, session_id, is_correct, answered_at, quiz_sessions!inner(path_id, user_id)')
        .eq('quiz_sessions.path_id', pathId)
        .eq('quiz_sessions.user_id', userId)
        .order('answered_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    'Failed to resolve path answers'
  )
  return rows.map(toAnswerRecord)
}

// Same ceiling as fetchLivePoolQuestions: a long id list in the URL gets
// rejected, so look the questions up a chunk at a time.
const LATEST_ANSWER_CHUNK_SIZE = 200

/**
 * Each of these questions' most recent answer by this user, from any quiz
 * (the plan itself or later practice). Questions never answered are absent.
 */
export async function getLatestAnswers(
  supabase: SupabaseClient,
  userId: string,
  questionIds: string[]
): Promise<Map<string, PathAnswerRecord>> {
  const latest = new Map<string, PathAnswerRecord>()
  for (let i = 0; i < questionIds.length; i += LATEST_ANSWER_CHUNK_SIZE) {
    const chunk = questionIds.slice(i, i + LATEST_ANSWER_CHUNK_SIZE)
    const rows = await fetchAllRows(
      (from, to) =>
        supabase
          .from('quiz_answers')
          .select('id, question_id, session_id, is_correct, answered_at, quiz_sessions!inner(user_id)')
          .eq('quiz_sessions.user_id', userId)
          .in('question_id', chunk)
          .order('answered_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      'Failed to load latest answers'
    )
    // Oldest first, so the last row seen for a question is its latest answer.
    for (const row of rows) {
      const answer = toAnswerRecord(row)
      latest.set(answer.questionId, answer)
    }
  }
  return latest
}

export async function getCoveredQuestionIds(
  supabase: SupabaseClient,
  pathId: string,
  userId: string
): Promise<Set<string>> {
  const answers = await getPathAnswers(supabase, pathId, userId)
  return new Set(answers.map((a) => a.questionId))
}

export async function getPathProgress(
  supabase: SupabaseClient,
  path: QuizPath,
  now: Date = new Date(),
  timeZone: string = DEFAULT_PLAN_TIME_ZONE
): Promise<PathProgress> {
  const poolIds: string[] = path.pool_question_ids

  const liveQuestions = await fetchLivePoolQuestions(supabase, poolIds)
  const livePoolIds = liveQuestions.map((q) => q.id)

  const covered = await getCoveredQuestionIds(supabase, path.id, path.user_id)

  const coveredCount = livePoolIds.filter((id) => covered.has(id)).length
  const poolSize = livePoolIds.length
  const percent = poolSize > 0 ? Math.round((coveredCount / poolSize) * 100) : 0

  const { expectedCount, expectedPercent, status: paceStatus } = computePace({
    poolSize,
    coveredCount,
    startDate: new Date(path.start_date),
    targetEndDate: new Date(path.target_end_date),
    daysPerWeek: path.days_per_week,
    today: now,
    timeZone,
  })

  const { questionCount: todaysQuestions } = planTodaysQuiz({
    uncoveredCount: poolSize - coveredCount,
    livePoolSize: poolSize,
    remainingDays: remainingScheduledDays(now, new Date(path.target_end_date), path.days_per_week, timeZone),
    savedQuestionsPerDay: path.questions_per_day,
  })

  return { poolSize, coveredCount, percent, paceStatus, expectedCount, expectedPercent, todaysQuestions }
}
