import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getAnsweredQuestionIds } from '@/lib/quiz/performance'
import { weightForCategory, MASTERY_CONFIG, type CategoryMasteryRow } from '@/lib/quiz/mastery'
import { weightedSampleWithoutReplacement } from '@/lib/quiz/sampling'
import type { SessionLength } from '@/types'

const SESSION_COUNTS: Record<SessionLength, number> = {
  quick: 7,
  standard: 17,
  full: 35,
  path: 0, // path sessions are built by /api/quiz/paths/[pathId]/start instead
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionLength }: { sessionLength: SessionLength } = await request.json()
  const targetCount = SESSION_COUNTS[sessionLength]

  // Get all approved questions
  const { data: questions } = await supabase
    .from('questions')
    .select('id, category')
    .eq('is_approved', true)

  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: 'No questions available' }, { status: 400 })
  }

  const now = new Date()

  // Mastery per category — recency-weighted, replaces lifetime accuracy.
  const { data: masteryRows } = await supabase
    .from('user_category_mastery')
    .select('category, ema_score, total_answered, last_answered_at, refresh_interval_days')
    .eq('user_id', user.id)

  const masteryByCategory = new Map<string, CategoryMasteryRow>(
    (masteryRows ?? []).map((r) => [r.category, r])
  )

  // Recently-seen questions get discounted so the same question doesn't
  // resurface too soon, even from a category that's still weak overall.
  const cooldownCutoff = new Date(now.getTime() - MASTERY_CONFIG.repeatCooldownDays * 86_400_000)
  const recentlySeen = await getAnsweredQuestionIds(supabase, user.id, cooldownCutoff)

  const weighted = questions.map((q) => {
    let weight = weightForCategory(masteryByCategory.get(q.category), now)
    if (recentlySeen.has(q.id)) weight *= MASTERY_CONFIG.repeatCooldownMultiplier
    return { id: q.id, weight }
  })

  const uniqueSelected = weightedSampleWithoutReplacement(weighted, targetCount)

  // Create session
  const { data: session, error } = await supabase
    .from('quiz_sessions')
    .insert({
      user_id: user.id,
      session_length: sessionLength,
      question_ids: uniqueSelected,
      current_index: 0,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sessionId: session.id })
}
