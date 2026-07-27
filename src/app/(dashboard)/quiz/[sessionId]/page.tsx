'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { QuizRunner, type QuizAnsweredResult } from '@/components/quiz/quiz-runner'
import type { Question, QuizSession } from '@/types'

export default function QuizSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [session, setSession] = useState<QuizSession | null>(null)
  const [question, setQuestion] = useState<Question | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCurrentQuestion()
  }, [sessionId])

  async function loadCurrentQuestion() {
    setLoading(true)

    const { data: sess } = await supabase
      .from('quiz_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (!sess) { router.push('/quiz'); return }

    if (sess.completed_at || sess.current_index >= sess.question_ids.length) {
      router.push(`/quiz/${sessionId}/results`)
      return
    }

    setSession(sess)

    const qId = sess.question_ids[sess.current_index]
    const { data: q } = await supabase.from('questions').select('*').eq('id', qId).single()
    setQuestion(q)

    setLoading(false)
  }

  async function handleAnswered(result: QuizAnsweredResult) {
    if (!question || !session) return
    await supabase.from('quiz_answers').insert({
      session_id: session.id,
      question_id: question.id,
      selected_answers: result.selectedAnswers,
      is_correct: result.isCorrect,
    })
  }

  async function handleNext() {
    if (!session) return
    const nextIndex = session.current_index + 1
    const isLast = nextIndex >= session.question_ids.length
    await supabase
      .from('quiz_sessions')
      .update({
        current_index: nextIndex,
        ...(isLast ? { completed_at: new Date().toISOString() } : {}),
      })
      .eq('id', session.id)
    if (isLast) {
      router.push(`/quiz/${sessionId}/results`)
    } else {
      loadCurrentQuestion()
    }
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto pt-10 text-center text-gray-500">Loading question…</div>
  }

  if (!question || !session) return null

  const progress = { current: session.current_index + 1, total: session.question_ids.length }
  const isLastQuestion = progress.current >= progress.total

  return (
    <QuizRunner
      key={question.id}
      question={question}
      progress={progress}
      onAnswered={handleAnswered}
      onNext={handleNext}
      nextLabel={isLastQuestion ? 'See Results' : 'Next Question →'}
    />
  )
}
