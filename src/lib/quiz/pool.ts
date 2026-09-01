import { createClient } from '@/lib/supabase/server'
import { classifyMastery } from '@/lib/quiz/mastery'
import type { PathPoolFilter } from '@/types'

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
