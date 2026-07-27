'use client'

// ============================================================
// Test Quiz — admin-only preview of the real quiz experience.
//
// Reuses QuizRunner (the same engine the real quiz uses) so the two stay
// identical by construction. The only thing that differs is persistence:
// answers are held in local React state for the duration of this page and
// discarded on navigation/refresh — nothing is ever written to Supabase.
// ============================================================

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { QuizRunner, type QuizAnsweredResult } from '@/components/quiz/quiz-runner'
import { TestQuizSetup } from '@/components/admin/test-quiz-setup'
import type { Question } from '@/types'

type Phase = 'setup' | 'quiz' | 'complete'

interface AnsweredEntry {
  questionId: string
  isCorrect: boolean
}

export default function TestQuizClient({ questions }: { questions: Question[] }) {
  const [phase, setPhase] = useState<Phase>('setup')
  const [selectedQuestions, setSelectedQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answered, setAnswered] = useState<AnsweredEntry[]>([])

  function handleStart(chosen: Question[]) {
    setSelectedQuestions(chosen)
    setCurrentIndex(0)
    setAnswered([])
    setPhase('quiz')
  }

  async function handleAnswered(result: QuizAnsweredResult) {
    const question = selectedQuestions[currentIndex]
    setAnswered((prev) => [...prev, { questionId: question.id, isCorrect: result.isCorrect }])
  }

  function handleNext() {
    const nextIndex = currentIndex + 1
    if (nextIndex >= selectedQuestions.length) {
      setPhase('complete')
    } else {
      setCurrentIndex(nextIndex)
    }
  }

  function handleRestart() {
    setPhase('setup')
    setSelectedQuestions([])
    setCurrentIndex(0)
    setAnswered([])
  }

  if (phase === 'setup') {
    return <TestQuizSetup questions={questions} onStart={handleStart} />
  }

  if (phase === 'complete') {
    const correct = answered.filter((a) => a.isCorrect).length
    return (
      <div className="max-w-md mx-auto text-center space-y-4 py-16">
        <p className="text-2xl font-bold text-gray-900">Test Quiz Complete</p>
        <p className="text-gray-600">
          You got <span className="font-semibold">{correct}</span> of{' '}
          <span className="font-semibold">{answered.length}</span> correct.
        </p>
        <p className="text-xs text-gray-400">Nothing from this run was recorded.</p>
        <Button onClick={handleRestart} size="lg">Start Another Test Quiz</Button>
      </div>
    )
  }

  const question = selectedQuestions[currentIndex]
  const isLastQuestion = currentIndex + 1 >= selectedQuestions.length

  return (
    <QuizRunner
      key={question.id}
      question={question}
      progress={{ current: currentIndex + 1, total: selectedQuestions.length }}
      onAnswered={handleAnswered}
      onNext={handleNext}
      nextLabel={isLastQuestion ? 'Finish Test Quiz' : 'Next Question →'}
    />
  )
}
