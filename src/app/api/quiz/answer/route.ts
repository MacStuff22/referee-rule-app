import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { scoreAnswer } from '@/lib/quiz/scoring'
import { classifyMastery, updateEma, nextRefreshInterval, MASTERY_CONFIG } from '@/lib/quiz/mastery'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, questionId, selectedAnswers } = await request.json()
  if (!sessionId || !questionId) {
    return NextResponse.json({ error: 'sessionId and questionId are required' }, { status: 400 })
  }

  // Ownership + existence in one check.
  const { data: session } = await supabase
    .from('quiz_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.completed_at) {
    return NextResponse.json({ error: 'Session already completed' }, { status: 400 })
  }
  if (session.question_ids[session.current_index] !== questionId) {
    return NextResponse.json({ error: 'Question is not the session\'s current question' }, { status: 400 })
  }

  const { data: question } = await supabase
    .from('questions')
    .select('*')
    .eq('id', questionId)
    .single()

  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  // Correctness is always computed here from the real question record —
  // the client's own belief about correctness is never read or trusted.
  const isCorrect = scoreAnswer(question, selectedAnswers)

  // No response-time column on purpose: elapsed time per question is
  // already derivable later from answered_at deltas within a session (or
  // started_at for the first question) if a future pass wants it — see
  // the Quiz Path / mastery build spec's notes on why raw seconds aren't
  // safe to weight on directly (question types vary a lot in length).
  const { error } = await supabase.from('quiz_answers').insert({
    session_id: sessionId,
    question_id: questionId,
    selected_answers: selectedAnswers,
    is_correct: isCorrect,
  })

  if (error) {
    // Unique violation → this question was already answered for this session.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Question already answered' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Best-effort: update this user's recency-weighted mastery for the
  // question's category. Never blocks or fails the answer submission itself.
  const { data: existingMastery } = await supabase
    .from('user_category_mastery')
    .select('ema_score, total_answered, refresh_interval_days')
    .eq('user_id', user.id)
    .eq('category', question.category)
    .maybeSingle()

  const priorEma = existingMastery?.ema_score ?? 0.5
  const priorTotal = existingMastery?.total_answered ?? 0
  const priorInterval = existingMastery?.refresh_interval_days ?? MASTERY_CONFIG.baseRefreshIntervalDays
  const wasMastered = classifyMastery(priorTotal, priorEma) === 'mastered'

  // Written via the service-role client, not the user's own request-scoped
  // one: ema_score/total_answered are trusted derived values (see the
  // comment on isCorrect above), and RLS no longer grants regular users any
  // insert/update on this table -- see supabase-migration-quiz-progress-
  // integrity.sql.
  const adminSupabase = createAdminClient()
  await adminSupabase.from('user_category_mastery').upsert(
    {
      user_id: user.id,
      category: question.category,
      ema_score: updateEma(priorEma, isCorrect),
      total_answered: priorTotal + 1,
      last_answered_at: new Date().toISOString(),
      refresh_interval_days: wasMastered ? nextRefreshInterval(priorInterval, isCorrect) : priorInterval,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,category' }
  )

  return NextResponse.json({ isCorrect })
}
