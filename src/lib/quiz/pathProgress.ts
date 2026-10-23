// ============================================================
// Quiz Path progress
//
// Derived entirely from existing quiz_sessions/quiz_answers rows tagged
// with a path_id — no separate progress-tracking table (see the
// migration file's rationale). Shared by the paths list and a path's
// own detail page so the two can't disagree on coverage/pace.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { computePace, type PaceStatus } from '@/lib/quiz/paths'
import { fetchLivePoolQuestions } from '@/lib/quiz/pool'
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
}

export const PACE_LABEL: Record<PaceStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  ahead: { label: 'Ahead of pace', variant: 'default' },
  'on-track': { label: 'On track', variant: 'secondary' },
  'due-today': { label: "On track — complete today's questions", variant: 'secondary' },
  behind: { label: 'Behind pace', variant: 'destructive' },
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

export async function getPathProgress(supabase: SupabaseClient, path: QuizPath, now: Date = new Date()): Promise<PathProgress> {
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
  })

  return { poolSize, coveredCount, percent, paceStatus, expectedCount, expectedPercent }
}
