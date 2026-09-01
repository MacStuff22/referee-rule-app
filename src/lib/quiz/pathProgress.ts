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

export async function getPathProgress(supabase: SupabaseClient, path: QuizPath): Promise<PathProgress> {
  const poolIds: string[] = path.pool_question_ids

  const liveQuestions = await fetchLivePoolQuestions(supabase, poolIds)
  const livePoolIds = liveQuestions.map((q) => q.id)

  const { data: completedSessions } = await supabase
    .from('quiz_sessions')
    .select('question_ids')
    .eq('path_id', path.id)
    .not('completed_at', 'is', null)

  const covered = new Set<string>()
  for (const s of completedSessions ?? []) {
    for (const id of (s.question_ids as string[]) ?? []) covered.add(id)
  }

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

  return { poolSize, coveredCount, percent, paceStatus }
}
