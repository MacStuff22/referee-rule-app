// ============================================================
// Category performance
//
// The dashboard (progress-by-category) and the quiz builder (weight my weak
// categories) both need the same aggregation: correct vs total answered per
// category. This is the single, correct implementation both call.
//
// Note: the previous dashboard version passed a query builder into .eq(),
// which Supabase cannot do, so it silently returned nothing. The correct
// pattern — fetch the user's session ids, then filter answers with .in() —
// lives here.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export type CategoryScores = Record<string, { correct: number; total: number }>

export async function getCategoryScores(
  supabase: SupabaseClient,
  userId: string
): Promise<CategoryScores> {
  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('id')
    .eq('user_id', userId)

  const sessionIds = sessions?.map((s) => s.id) ?? []
  if (sessionIds.length === 0) return {}

  const { data: answers } = await supabase
    .from('quiz_answers')
    .select('is_correct, questions(category)')
    .in('session_id', sessionIds)

  return aggregateCategoryScores(answers ?? [])
}

/**
 * Pure aggregation split out so it can be unit-tested without a database.
 * Each row is { is_correct, questions }, where the embedded `questions` may be
 * either a single object or a one-element array depending on how the query is
 * typed — both are handled here.
 */
export function aggregateCategoryScores(
  answers: Array<{ is_correct: boolean; questions?: unknown }>
): CategoryScores {
  const scores: CategoryScores = {}
  for (const a of answers) {
    const rel = Array.isArray(a.questions) ? a.questions[0] : a.questions
    const cat = (rel as { category?: string | null } | null | undefined)?.category ?? 'Unknown'
    if (!scores[cat]) scores[cat] = { correct: 0, total: 0 }
    scores[cat].total++
    if (a.is_correct) scores[cat].correct++
  }
  return scores
}
