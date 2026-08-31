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
import type { QuizPath } from '@/types'

export interface PathProgress {
  poolSize: number
  coveredCount: number
  percent: number
  paceStatus: 'ahead' | 'on-track' | 'behind'
}

export async function getPathProgress(supabase: SupabaseClient, path: QuizPath): Promise<PathProgress> {
  const poolIds: string[] = path.pool_question_ids

  const { data: liveQuestions } = await supabase
    .from('questions')
    .select('id')
    .eq('is_approved', true)
    .in('id', poolIds)
  const livePoolIds = (liveQuestions ?? []).map((q) => q.id as string)

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

  const paceStatus: PathProgress['paceStatus'] =
    coveredCount >= expectedByNow ? (coveredCount > expectedByNow * 1.1 ? 'ahead' : 'on-track') : 'behind'

  return { poolSize, coveredCount, percent, paceStatus }
}
