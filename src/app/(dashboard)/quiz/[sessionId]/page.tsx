'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScoreboardSimulator } from '@/components/quiz/scoreboard-simulator'
import { encodeCompoundAnswer, type ScoreboardAnswerEntry } from '@/lib/quiz/answers'
import { parseScoreboardConfig } from '@/types/scoreboard'
import type { Question, QuizSession } from '@/types'

type AnswerState = 'unanswered' | 'correct' | 'incorrect'

const CLOCK_ENTRY = /^(.+?)\s*[–—]\s*(\d+:\d{2}|washed\s*out)$/i

function renderOptionText(opt: string) {
  const parts = opt.split(' | ')
  const isClockFormat = parts.length > 1 && parts.every(p => CLOCK_ENTRY.test(p.trim()))
  if (!isClockFormat) return <>{opt}</>
  return (
    <span className="flex flex-wrap gap-x-5 gap-y-1">
      {parts.map((part, i) => {
        const m = part.trim().match(CLOCK_ENTRY)
        if (!m) return <span key={i}>{part}</span>
        const [, player, time] = m
        const isWashed = /washed/i.test(time)
        return (
          <span key={i} className="inline-flex items-center gap-1.5">
            <span className="font-medium">{player}</span>
            <span className={isWashed ? 'line-through text-gray-400' : 'text-blue-600 font-mono tabular-nums'}>{time}</span>
          </span>
        )
      })}
    </span>
  )
}

export default function QuizSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [session, setSession] = useState<QuizSession | null>(null)
  const [question, setQuestion] = useState<Question | null>(null)
  const [loading, setLoading] = useState(true)

  // Standard question state
  const [selected, setSelected] = useState<number[]>([])
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered')
  const [shuffledOrder, setShuffledOrder] = useState<number[]>([])

  // Compound question state
  const [compoundSubIndex, setCompoundSubIndex] = useState(0)
  const [compoundSubAnswers, setCompoundSubAnswers] = useState<number[][]>([])
  const [compoundSubCorrect, setCompoundSubCorrect] = useState<boolean[]>([])
  const [subShuffledOrders, setSubShuffledOrders] = useState<number[][]>([])

  useEffect(() => {
    loadCurrentQuestion()
  }, [sessionId])

  function shuffleIndices(count: number): number[] {
    const arr = Array.from({ length: count }, (_, i) => i)
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  async function loadCurrentQuestion() {
    setLoading(true)
    setSelected([])
    setAnswerState('unanswered')
    setShuffledOrder([])
    setCompoundSubIndex(0)
    setCompoundSubAnswers([])
    setCompoundSubCorrect([])
    setSubShuffledOrders([])

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

    // Scoreboard questions manage their own state inside <ScoreboardSimulator>
    // (remounted per question via key), so no per-question setup is needed here.
    if (q) {
      if (q.question_type === 'compound') {
        setSubShuffledOrders((q.sub_questions ?? []).map((sq: any) => shuffleIndices(sq.options.length)))
      } else if (q.question_type !== 'scoreboard') {
        setShuffledOrder(shuffleIndices(q.options.length))
      }
    }

    setLoading(false)
  }

  function toggleOption(originalIdx: number) {
    if (answerState !== 'unanswered') return
    const effectiveAnswerType =
      question?.question_type === 'compound'
        ? (question.sub_questions[compoundSubIndex]?.answer_type ?? 'multiple_choice')
        : question?.answer_type
    if (effectiveAnswerType === 'multiple_choice') {
      setSelected([originalIdx])
    } else {
      setSelected((prev) =>
        prev.includes(originalIdx) ? prev.filter((i) => i !== originalIdx) : [...prev, originalIdx]
      )
    }
  }

  // ─── Standard question submit ───────────────────────────────────────────────

  async function submitAnswer() {
    if (!question || !session || selected.length === 0) return
    const sortedSelected = [...selected].sort()
    const sortedCorrect = [...question.correct_answers].sort()
    const isCorrect = JSON.stringify(sortedSelected) === JSON.stringify(sortedCorrect)
    setAnswerState(isCorrect ? 'correct' : 'incorrect')
    await supabase.from('quiz_answers').insert({
      session_id: session.id,
      question_id: question.id,
      selected_answers: selected,
      is_correct: isCorrect,
    })
  }

  // ─── Compound question submit ───────────────────────────────────────────────

  async function submitCompoundAnswer() {
    if (!question || !session || selected.length === 0) return
    const subQ = question.sub_questions[compoundSubIndex]
    const sortedSelected = [...selected].sort()
    const sortedCorrect = [...subQ.correct_answers].sort()
    const isCorrect = JSON.stringify(sortedSelected) === JSON.stringify(sortedCorrect)
    const newSubAnswers: number[][] = [...compoundSubAnswers, selected]
    const newSubCorrect = [...compoundSubCorrect, isCorrect]
    setAnswerState(isCorrect ? 'correct' : 'incorrect')
    setCompoundSubAnswers(newSubAnswers)
    setCompoundSubCorrect(newSubCorrect)
    const isLastSubQ = compoundSubIndex === question.sub_questions.length - 1
    if (isLastSubQ) {
      const overallCorrect = newSubCorrect.every(Boolean)
      await supabase.from('quiz_answers').insert({
        session_id: session.id,
        question_id: question.id,
        selected_answers: encodeCompoundAnswer(newSubAnswers),
        is_correct: overallCorrect,
      })
    }
  }

  function advanceSubQuestion() {
    setCompoundSubIndex((i) => i + 1)
    setSelected([])
    setAnswerState('unanswered')
  }

  // ─── Scoreboard question submit (invoked by ScoreboardSimulator) ─────────────

  async function saveScoreboardAnswer(result: { isCorrect: boolean; entries: ScoreboardAnswerEntry[] }) {
    if (!question || !session) return
    await supabase.from('quiz_answers').insert({
      session_id: session.id,
      question_id: question.id,
      selected_answers: result.entries,
      is_correct: result.isCorrect,
    })
  }

  // ─── Advance to next question ────────────────────────────────────────────────

  async function nextQuestion() {
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

  // ─── Loading / guard ────────────────────────────────────────────────────────

  if (loading) {
    return <div className="max-w-2xl mx-auto pt-10 text-center text-gray-500">Loading question…</div>
  }

  if (!question || !session) return null

  const progress = session.current_index + 1
  const total = session.question_ids.length
  const isLastQuestion = progress >= total

  const progressBar = (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Question {progress} of {total}</span>
        <div className="flex gap-2">
          <Badge variant="outline">{question.league}</Badge>
          <Badge variant="outline">{question.category}</Badge>
          <Badge variant="outline">Rule {question.rule_number}</Badge>
        </div>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div
          className="bg-slate-900 h-1.5 rounded-full transition-all"
          style={{ width: `${(progress / total) * 100}%` }}
        />
      </div>
    </div>
  )

  // ─── Compound question render ────────────────────────────────────────────────

  if (question.question_type === 'compound') {
    const subQs = question.sub_questions ?? []
    const subQ = subQs[compoundSubIndex]
    const shuffleOrder = subShuffledOrders[compoundSubIndex] ?? subQ.options.map((_: any, i: number) => i)
    const isLastSubQ = compoundSubIndex === subQs.length - 1

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {progressBar}

        <div className="rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Situation</p>
          <p className="text-sm text-blue-900 leading-relaxed">{question.text}</p>
        </div>

        <div className="flex items-center gap-2">
          {subQs.map((_: any, i: number) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                i < compoundSubIndex
                  ? 'bg-slate-700'
                  : i === compoundSubIndex
                  ? 'bg-slate-400'
                  : 'bg-gray-200'
              }`}
            />
          ))}
          <span className="text-xs text-gray-400 whitespace-nowrap">Part {compoundSubIndex + 1} of {subQs.length}</span>
        </div>

        <Card>
          <CardContent className="pt-6">
            <p className="font-medium text-gray-900 text-base leading-relaxed mb-1">{subQ.text}</p>
            {subQ.answer_type === 'multi_select' && (
              <p className="text-xs text-gray-400 mb-4">Select all that apply</p>
            )}
            <div className="space-y-2 mt-3">
              {shuffleOrder.map((originalIdx: number, displayIdx: number) => {
                const opt = subQ.options[originalIdx]
                const isSelected = selected.includes(originalIdx)
                const isCorrect = subQ.correct_answers.includes(originalIdx)
                let style = 'border-gray-200 bg-white hover:border-gray-300'
                if (answerState !== 'unanswered') {
                  if (isCorrect) style = 'border-green-500 bg-green-50 text-green-900'
                  else if (isSelected && !isCorrect) style = 'border-red-400 bg-red-50 text-red-900'
                } else if (isSelected) {
                  style = 'border-slate-900 bg-slate-50'
                }
                return (
                  <button
                    key={originalIdx}
                    onClick={() => toggleOption(originalIdx)}
                    disabled={answerState !== 'unanswered'}
                    className={`w-full text-left px-4 py-3 rounded-lg border-2 text-sm transition-all ${style}`}
                  >
                    <span className="font-medium mr-2">{String.fromCharCode(65 + displayIdx)}.</span>
                    {renderOptionText(opt)}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {answerState !== 'unanswered' && (
          <Card className={answerState === 'correct' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
            <CardContent className="pt-4 pb-4 space-y-2">
              <p className={`font-semibold ${answerState === 'correct' ? 'text-green-800' : 'text-red-800'}`}>
                {answerState === 'correct' ? '✅ Correct!' : '❌ Not quite.'}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-medium">📖 Rationale: </span>{subQ.rationale}
              </p>
              <p className="text-sm text-gray-500">
                <span className="font-medium">📋 Rule {question.rule_number}</span>
              </p>
            </CardContent>
          </Card>
        )}

        {answerState === 'unanswered' ? (
          <Button onClick={submitCompoundAnswer} disabled={selected.length === 0} className="w-full" size="lg">
            Submit Answer
          </Button>
        ) : !isLastSubQ ? (
          <Button onClick={advanceSubQuestion} className="w-full" size="lg">Next Part →</Button>
        ) : (
          <Button onClick={nextQuestion} className="w-full" size="lg">
            {isLastQuestion ? 'See Results' : 'Next Question →'}
          </Button>
        )}
      </div>
    )
  }

  // ─── Scoreboard question render ──────────────────────────────────────────────

  if (question.question_type === 'scoreboard') {
    const config = parseScoreboardConfig(question.sub_questions?.[0])
    if (!config) {
      return (
        <div className="max-w-2xl mx-auto space-y-4">
          {progressBar}
          <Card>
            <CardContent className="pt-6 text-sm text-red-600">
              This scoreboard question is misconfigured and can’t be displayed.
            </CardContent>
          </Card>
          <Button onClick={nextQuestion} className="w-full" size="lg">
            {isLastQuestion ? 'See Results' : 'Skip →'}
          </Button>
        </div>
      )
    }

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {progressBar}

        {/* Situation */}
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Situation</p>
          <p className="text-sm text-blue-900 leading-relaxed">{question.text}</p>
        </div>

        <ScoreboardSimulator
          key={question.id}
          period={config.period}
          startGT={config.start_gt}
          events={config.events}
          playerAnswers={config.player_answers}
          situationType={config.situation_type}
          rationale={question.rationale}
          ruleNumber={question.rule_number}
          revealAnswer
          onSubmit={saveScoreboardAnswer}
          onNext={nextQuestion}
          nextLabel={isLastQuestion ? 'See Results' : 'Next Question →'}
        />
      </div>
    )
  }

  // ─── Standard question render ────────────────────────────────────────────────

  const penaltyTable = (question as any).penalty_table as { teamA?: any[]; teamB?: any[] } | null
  const penA: any[] = penaltyTable?.teamA ?? []
  const penB: any[] = penaltyTable?.teamB ?? []

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {progressBar}

      {/* Penalty table */}
      {(penA.length > 0 || penB.length > 0) && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-slate-200">
            {(['A', 'B'] as const).map((team) => {
              const entries = team === 'A' ? penA : penB
              return (
                <div key={team}>
                  <div className={`px-3 py-2 text-center text-[11px] font-bold uppercase tracking-widest border-b border-slate-200 bg-slate-800 ${team === 'A' ? 'text-blue-300' : 'text-red-300'}`}>
                    Team {team}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {entries.map((e: any, i: number) => (
                      <div key={i} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
                        <span>
                          <span className="font-bold text-slate-700">#{e.player}</span>
                          <span className="text-slate-500 ml-2">{e.penalties}</span>
                        </span>
                        {e.time?.trim() && (
                          <span className="text-slate-400 font-mono text-xs shrink-0">{e.time}</span>
                        )}
                      </div>
                    ))}
                    {entries.length === 0 && (
                      <div className="px-3 py-2 text-sm text-slate-400 italic">—</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <p className="font-medium text-gray-900 text-base leading-relaxed mb-1">
            {question.text}
          </p>
          {question.answer_type === 'multi_select' && (
            <p className="text-xs text-gray-400 mb-4">Select all that apply</p>
          )}

          <div className="space-y-2 mt-4">
            {(shuffledOrder.length === question.options.length ? shuffledOrder : question.options.map((_, i) => i)).map((originalIdx, displayIdx) => {
              const opt = question.options[originalIdx]
              const isSelected = selected.includes(originalIdx)
              const isCorrect = question.correct_answers.includes(originalIdx)
              let style = 'border-gray-200 bg-white hover:border-gray-300'

              if (answerState !== 'unanswered') {
                if (isCorrect) style = 'border-green-500 bg-green-50 text-green-900'
                else if (isSelected && !isCorrect) style = 'border-red-400 bg-red-50 text-red-900'
              } else if (isSelected) {
                style = 'border-slate-900 bg-slate-50'
              }

              return (
                <button
                  key={originalIdx}
                  onClick={() => toggleOption(originalIdx)}
                  disabled={answerState !== 'unanswered'}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 text-sm transition-all ${style}`}
                >
                  <span className="font-medium mr-2">{String.fromCharCode(65 + displayIdx)}.</span>
                  {renderOptionText(opt)}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {answerState !== 'unanswered' && (
        <Card className={answerState === 'correct' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
          <CardContent className="pt-4 pb-4 space-y-2">
            <p className={`font-semibold ${answerState === 'correct' ? 'text-green-800' : 'text-red-800'}`}>
              {answerState === 'correct' ? '✅ Correct!' : '❌ Not quite.'}
            </p>
            <p className="text-sm text-gray-700">
              <span className="font-medium">📖 Rationale: </span>{question.rationale}
            </p>
            <p className="text-sm text-gray-500">
              <span className="font-medium">📋 Rule {question.rule_number}</span>
            </p>
          </CardContent>
        </Card>
      )}

      {answerState === 'unanswered' ? (
        <Button onClick={submitAnswer} disabled={selected.length === 0} className="w-full" size="lg">
          Submit Answer
        </Button>
      ) : (
        <Button onClick={nextQuestion} className="w-full" size="lg">
          {isLastQuestion ? 'See Results' : 'Next Question →'}
        </Button>
      )}
    </div>
  )
}
