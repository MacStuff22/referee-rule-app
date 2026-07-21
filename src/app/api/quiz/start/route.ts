import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getCategoryScores } from '@/lib/quiz/performance'
import type { SessionLength } from '@/types'

const SESSION_COUNTS: Record<SessionLength, number> = {
  quick: 7,
  standard: 17,
  full: 35,
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

  // Get user's performance per category (shared with the dashboard)
  const categoryScores = await getCategoryScores(supabase, user.id)

  // Assign weight per question: weaker categories get higher weight
  // New categories (never seen) get a medium weight of 0.5
  const weighted = questions.map((q) => {
    const score = categoryScores[q.category]
    let weight: number
    if (!score || score.total === 0) {
      weight = 0.5
    } else {
      const pct = score.correct / score.total
      // Invert: 0% correct → weight 1.0, 100% correct → weight 0.1
      weight = Math.max(0.1, 1 - pct * 0.9)
    }
    return { id: q.id, weight }
  })

  // Weighted random sample without replacement
  const selected: string[] = []
  const pool = [...weighted]
  const maxCount = Math.min(targetCount, pool.length) // compute once — pool shrinks each iteration

  while (selected.length < maxCount && pool.length > 0) {
    const totalWeight = pool.reduce((sum, q) => sum + q.weight, 0)
    let rand = Math.random() * totalWeight
    let picked = -1
    for (let i = 0; i < pool.length; i++) {
      rand -= pool[i].weight
      if (rand <= 0) { picked = i; break }
    }
    // Floating-point guard: if rand stayed above 0, take the last item
    if (picked === -1) picked = pool.length - 1
    selected.push(pool[picked].id)
    pool.splice(picked, 1)
  }

  // Explicit dedup — should never fire, but guarantees uniqueness
  const uniqueSelected = [...new Set(selected)]

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
