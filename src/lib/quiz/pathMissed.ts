// ============================================================
// Questions still being missed from a finished Study Plan
//
// One place that answers "which of this plan's questions is the user still
// getting wrong?" so the report, the quick retake quiz and the retake plan
// can't disagree. "Still missed" = the latest answer anywhere (the plan or
// later practice) was wrong; see stillMissedQuestions in pathReport.ts.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { getLatestAnswers, getPathAnswers, type PathAnswerRecord } from '@/lib/quiz/pathProgress'
import { fetchLivePoolQuestions, resolvePool, type LivePoolQuestion } from '@/lib/quiz/pool'
import { stillMissedQuestions, type MissedQuestion } from '@/lib/quiz/pathReport'
import type { PathPoolFilter, QuizPath } from '@/types'

export interface StillMissed {
  liveQuestions: LivePoolQuestion[]
  planAnswers: PathAnswerRecord[]
  missed: MissedQuestion[]
}

export async function loadStillMissed(
  supabase: SupabaseClient,
  path: Pick<QuizPath, 'id' | 'pool_question_ids'>,
  userId: string
): Promise<StillMissed> {
  const liveQuestions = await fetchLivePoolQuestions(supabase, path.pool_question_ids)
  const planAnswers = await getPathAnswers(supabase, path.id, userId)
  const latestAnswers = await getLatestAnswers(supabase, userId, liveQuestions.map((q) => q.id))
  const missed = stillMissedQuestions({ poolQuestionIds: liveQuestions.map((q) => q.id), latestAnswers, planAnswers })
  return { liveQuestions, planAnswers, missed }
}

/** Thrown for a request that can never work (not the user's plan, not finished); callers show it as is. */
export class PoolRequestError extends Error {}

/**
 * Works out a new plan's question pool on the server. A missed-questions pool
 * only ever comes from the user's own finished plan, and is read from their
 * answers here, never from anything the client sends.
 */
export async function resolvePathPool(
  supabase: SupabaseClient,
  userId: string,
  poolFilter: PathPoolFilter
): Promise<{ questionIds: string[]; resolvedFilter: PathPoolFilter }> {
  if (poolFilter.type !== 'missed_questions') {
    return resolvePool(supabase as Parameters<typeof resolvePool>[0], userId, poolFilter)
  }

  const { data: source } = await supabase
    .from('quiz_paths')
    .select('id, status, pool_question_ids')
    .eq('id', poolFilter.sourcePathId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!source) throw new PoolRequestError('That study plan could not be found.')
  if (source.status !== 'completed') throw new PoolRequestError('Finish that study plan before retaking what you missed.')

  const { missed } = await loadStillMissed(supabase, source, userId)
  return { questionIds: missed.map((m) => m.questionId), resolvedFilter: poolFilter }
}
