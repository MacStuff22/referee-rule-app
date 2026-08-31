// ============================================================
// User answer history
//
// Small Supabase-touching helpers shared by quiz-start weighting and the
// dashboard. quiz_answers has no user_id column of its own, so every
// query here goes through the user's session ids first, then filters
// answers by those — the correct pattern since a query builder can't
// filter on a joined table's column via .eq() (see getRecentlyAnsweredQuestionIds).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

async function getSessionIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('id')
    .eq('user_id', userId)
  return sessions?.map((s) => s.id) ?? []
}

/**
 * Question ids this user has answered, optionally restricted to answers
 * on/after `sinceDate`. With no date, returns every distinct question the
 * user has ever answered (used for the "rule book coverage" stat). With a
 * date, used to apply the repeat-cooldown discount at quiz-start.
 */
export async function getAnsweredQuestionIds(
  supabase: SupabaseClient,
  userId: string,
  sinceDate?: Date
): Promise<Set<string>> {
  const sessionIds = await getSessionIds(supabase, userId)
  if (sessionIds.length === 0) return new Set()

  let query = supabase
    .from('quiz_answers')
    .select('question_id, answered_at')
    .in('session_id', sessionIds)

  if (sinceDate) query = query.gte('answered_at', sinceDate.toISOString())

  const { data: answers } = await query
  return new Set((answers ?? []).map((a) => a.question_id as string))
}
