// ============================================================
// Quiz Path progress
//
// Derived entirely from existing quiz_sessions/quiz_answers rows tagged
// with a path_id — no separate progress-tracking table (see the
// migration file's rationale). Shared by the paths list and a path's
// own detail page so the two can't disagree on coverage/pace.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { scheduledDaysBetween } from '@/lib/quiz/paths'
import { fetchLivePoolQuestions } from '@/lib/quiz/pool'
import type { QuizPath } from '@/types'

export type PaceStatus = 'ahead' | 'on-track' | 'due-today' | 'behind'

export interface PathProgress {
  poolSize: number
  coveredCount: number
  percent: number
  paceStatus: PaceStatus
  /** Questions you'd have covered by today if you were exactly on pace — drives the pace marker on the progress bar. */
  expectedCount: number
  expectedPercent: number
}

export const PACE_LABEL: Record<PaceStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  ahead: { label: 'Ahead of pace', variant: 'default' },
  'on-track': { label: 'On track', variant: 'secondary' },
  'due-today': { label: "On track — complete today's questions", variant: 'secondary' },
  behind: { label: 'Behind pace', variant: 'destructive' },
}

function oneDayBefore(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - 1)
  return d
}

export interface PathAnswerRecord {
  questionId: string
  answeredAt: string
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
  const { data, error } = await supabase
    .from('quiz_answers')
    .select('question_id, answered_at, quiz_sessions!inner(path_id, user_id)')
    .eq('quiz_sessions.path_id', pathId)
    .eq('quiz_sessions.user_id', userId)
    .order('answered_at', { ascending: true })

  if (error) throw new Error(`Failed to resolve path answers: ${error.message}`)
  return (data ?? []).map((row) => ({
    questionId: row.question_id as string,
    answeredAt: row.answered_at as string,
  }))
}

export async function getCoveredQuestionIds(
  supabase: SupabaseClient,
  pathId: string,
  userId: string
): Promise<Set<string>> {
  const answers = await getPathAnswers(supabase, pathId, userId)
  return new Set(answers.map((a) => a.questionId))
}

export async function getPathProgress(supabase: SupabaseClient, path: QuizPath): Promise<PathProgress> {
  const poolIds: string[] = path.pool_question_ids

  const liveQuestions = await fetchLivePoolQuestions(supabase, poolIds)
  const livePoolIds = liveQuestions.map((q) => q.id)

  const covered = await getCoveredQuestionIds(supabase, path.id, path.user_id)

  const coveredCount = livePoolIds.filter((id) => covered.has(id)).length
  const poolSize = livePoolIds.length
  const percent = poolSize > 0 ? Math.round((coveredCount / poolSize) * 100) : 0

  const today = new Date()
  const start = new Date(path.start_date)
  const end = new Date(path.target_end_date)
  const elapsedCap = today < end ? today : end
  const scheduledSoFar = elapsedCap > start ? scheduledDaysBetween(start, elapsedCap, path.days_per_week) : 0
  const expectedByNow = scheduledSoFar * path.questions_per_day

  // Everything scheduled through yesterday — falling short of *this* is a
  // genuine miss. The gap between it and expectedByNow is just today's still-
  // open quota, which shouldn't read as "behind" before the day is even done.
  const yesterday = oneDayBefore(elapsedCap)
  const scheduledByYesterday = yesterday > start ? scheduledDaysBetween(start, yesterday, path.days_per_week) : 0
  const expectedByYesterday = scheduledByYesterday * path.questions_per_day

  let paceStatus: PaceStatus
  if (coveredCount >= expectedByNow) {
    paceStatus = coveredCount > expectedByNow * 1.1 ? 'ahead' : 'on-track'
  } else if (coveredCount >= expectedByYesterday) {
    paceStatus = 'due-today'
  } else {
    paceStatus = 'behind'
  }

  const expectedCount = Math.min(expectedByNow, poolSize)
  const expectedPercent = poolSize > 0 ? Math.round((expectedCount / poolSize) * 100) : 0

  return { poolSize, coveredCount, percent, paceStatus, expectedCount, expectedPercent }
}
