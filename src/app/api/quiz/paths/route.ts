import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { classifyMastery } from '@/lib/quiz/mastery'
import { computeQuestionsPerDay, computeTargetEndDate } from '@/lib/quiz/paths'
import type { PathPoolFilter } from '@/types'

interface CreatePathBody {
  name: string
  poolFilter: PathPoolFilter
  daysPerWeek: number
  pace: { targetEndDate: string } | { questionsPerDay: number }
}

async function resolvePool(
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

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: CreatePathBody = await request.json()
  const { name, poolFilter, daysPerWeek, pace } = body

  if (!name || !poolFilter || !daysPerWeek || !pace) {
    return NextResponse.json({ error: 'name, poolFilter, daysPerWeek and pace are required' }, { status: 400 })
  }

  const { questionIds, resolvedFilter } = await resolvePool(supabase, user.id, poolFilter)

  if (questionIds.length === 0) {
    const message = poolFilter.type === 'weak_areas'
      ? 'No weak categories identified yet — take a few quizzes first, or start a broader plan.'
      : 'No approved questions match this plan yet.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const startDate = new Date()
  const startDateIso = startDate.toISOString().slice(0, 10)

  let questionsPerDay: number
  let targetEndDate: string

  if ('questionsPerDay' in pace) {
    questionsPerDay = pace.questionsPerDay
    targetEndDate = computeTargetEndDate(questionIds.length, questionsPerDay, startDate, daysPerWeek)
      .toISOString()
      .slice(0, 10)
  } else {
    targetEndDate = pace.targetEndDate
    questionsPerDay = computeQuestionsPerDay(questionIds.length, startDate, new Date(pace.targetEndDate), daysPerWeek)
  }

  const { data: path, error } = await supabase
    .from('quiz_paths')
    .insert({
      user_id: user.id,
      name,
      pool_filter: resolvedFilter,
      pool_question_ids: questionIds,
      start_date: startDateIso,
      target_end_date: targetEndDate,
      days_per_week: daysPerWeek,
      questions_per_day: questionsPerDay,
      status: 'active',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ pathId: path.id })
}
