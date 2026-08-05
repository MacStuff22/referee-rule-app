import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { scoreAnswer } from '@/lib/quiz/scoring'

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

  return NextResponse.json({ isCorrect })
}
