import { createClient } from '@/lib/supabase/server'
import { classifyMastery } from '@/lib/quiz/mastery'
import type { PathPoolFilter } from '@/types'

// Supabase serializes `.in('id', ids)` as a literal id list in the request
// URL — a plan pool large enough (the ~650-question Situation Book already
// gets there) blows the gateway's request-line length limit and comes back
// as an opaque 400, which callers were previously ignoring (treating the
// pool as empty). Chunking keeps each request well under that ceiling
// regardless of how large a plan's pool grows.
const LIVE_POOL_CHUNK_SIZE = 200

export interface LivePoolQuestion {
  id: string
  category: string
  situation_id: string
}

/** Cross-references a path's snapshotted pool_question_ids against currently-approved questions. */
export async function fetchLivePoolQuestions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poolIds: string[]
): Promise<LivePoolQuestion[]> {
  const results: LivePoolQuestion[] = []
  for (let i = 0; i < poolIds.length; i += LIVE_POOL_CHUNK_SIZE) {
    const chunk = poolIds.slice(i, i + LIVE_POOL_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('questions')
      .select('id, category, situation_id')
      .eq('is_approved', true)
      .in('id', chunk)
    if (error) throw new Error(`Failed to resolve live pool questions: ${error.message}`)
    for (const q of data ?? [])
      results.push({ id: q.id as string, category: q.category as string, situation_id: q.situation_id as string })
  }
  return results
}

export async function resolvePool(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  poolFilter: PathPoolFilter
): Promise<{ questionIds: string[]; resolvedFilter: PathPoolFilter }> {
  if (poolFilter.type === 'situation_book') {
    const { data } = await supabase.from('questions').select('id').eq('is_approved', true).neq('situation_id', '')
    return { questionIds: (data ?? []).map((q) => q.id), resolvedFilter: poolFilter }
  }

  if (poolFilter.type === 'categories') {
    const { data } = await supabase
      .from('questions')
      .select('id')
      .eq('is_approved', true)
      .in('category', poolFilter.categories)
    return { questionIds: (data ?? []).map((q) => q.id), resolvedFilter: poolFilter }
  }

  // weak_areas: the category list is resolved from the server's own mastery
  // data, never trusted from the client, and snapshotted into the stored filter.
  const { data: masteryRows } = await supabase
    .from('user_category_mastery')
    .select('category, ema_score, total_answered')
    .eq('user_id', userId)

  const weakCategories = (masteryRows ?? [])
    .filter((r) => classifyMastery(r.total_answered, r.ema_score) === 'developing')
    .map((r) => r.category)

  if (weakCategories.length === 0) {
    return { questionIds: [], resolvedFilter: { type: 'weak_areas', categories: [] } }
  }

  const { data } = await supabase.from('questions').select('id').eq('is_approved', true).in('category', weakCategories)
  return { questionIds: (data ?? []).map((q) => q.id), resolvedFilter: { type: 'weak_areas', categories: weakCategories } }
}
