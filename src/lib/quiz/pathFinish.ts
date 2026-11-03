// ============================================================
// Study Plan finish line
//
// A plan is finished when every question in its live pool has been answered
// at least once. This marks it completed the moment that is true, and says
// whether THIS call was the one that did it, so exactly one request gets to
// send the user to the celebration. Callers: the quiz results page (right
// after the last answer) and the plan's start route (someone who answered the
// last question and closed the tab before reaching the results).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { getCoveredQuestionIds } from '@/lib/quiz/pathProgress'
import { fetchLivePoolQuestions } from '@/lib/quiz/pool'
import type { QuizPath } from '@/types'

export type FinishOutcome = 'just-completed' | 'already-completed' | 'not-finished'

/**
 * Flips an active plan to completed. True only for the call that actually did
 * it: the update is conditional on the plan still being active, so when two
 * requests race, only one of them sees a row come back.
 */
export async function markPathCompleted(supabase: SupabaseClient, pathId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('quiz_paths')
    .update({ status: 'completed' })
    .eq('id', pathId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .select('id')
  if (error) throw new Error(`Failed to complete plan: ${error.message}`)
  return !!data && data.length > 0
}

export async function completePathIfFinished(
  supabase: SupabaseClient,
  path: Pick<QuizPath, 'id' | 'status' | 'pool_question_ids'>,
  userId: string
): Promise<FinishOutcome> {
  if (path.status === 'completed') return 'already-completed'
  // An abandoned plan stays abandoned.
  if (path.status !== 'active') return 'not-finished'

  // Restricting to currently-approved questions lets the pool self-heal if a
  // question is later unapproved, instead of getting stuck as uncovered.
  const livePool = await fetchLivePoolQuestions(supabase, path.pool_question_ids)
  const covered = await getCoveredQuestionIds(supabase, path.id, userId)
  if (livePool.some((q) => !covered.has(q.id))) return 'not-finished'

  return (await markPathCompleted(supabase, path.id, userId)) ? 'just-completed' : 'already-completed'
}
