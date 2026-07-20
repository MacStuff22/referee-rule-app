'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Question, QuizSession } from '@/types'

type AnswerState = 'unanswered' | 'correct' | 'incorrect'

// ─── Scoreboard helpers ──────────────────────────────────────────────────────

function sbFormatGT(secs: number): string {
  const m = Math.floor(Math.abs(secs) / 60)
  const s = Math.abs(secs) % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const SB_PENALTY_SECS: Record<string, number> = {
  minor: 120, double_minor: 240, major: 300, match: 300,
}

function sbEventTotalSecs(evt: any): number {
  return (evt.penalties ?? []).reduce((sum: number, p: any) => sum + (SB_PENALTY_SECS[p.penalty_type] ?? 120), 0)
}

function sbPenaltyLabel(evt: any): string {
  if (!evt.penalties?.length) return ''
  return evt.penalties.map((p: any) => {
    const type = p.penalty_type === 'double_minor' ? 'Double Minor'
      : p.penalty_type === 'major' ? 'Major'
      : p.penalty_type === 'match' ? 'Match'
      : 'Minor'
    return p.infraction ? `${type} (${p.infraction})` : type
  }).join(' + ')
}

interface SbOption { key: string; label: string; secs: number | null; isWashOut: boolean; isCorrect: boolean }

function generateSbOptions(playerAnswer: any, allAnswers: any[], events: any[]): SbOption[] {
  const goalEvt = events.find((e: any) => e.type === 'goal')
  const goalGT: number = goalEvt?.gt ?? 0

  // Naive remaining = total penalty time - elapsed (without Rule 16.2 adjustment)
  const penEvt = events.find((e: any) => e.type === 'penalty' && e.team === playerAnswer.team && e.player === playerAnswer.player)
  const naiveSecs = penEvt
    ? Math.max(0, sbEventTotalSecs(penEvt) - (penEvt.gt - goalGT))
    : 0

  const correct: SbOption = playerAnswer.wash_out
    ? { key: 'wo', label: 'Washed Out', secs: null, isWashOut: true, isCorrect: true }
    : { key: String(playerAnswer.correct_secs), label: sbFormatGT(playerAnswer.correct_secs), secs: playerAnswer.correct_secs, isWashOut: false, isCorrect: true }

  const pool: SbOption[] = []
  const seen = new Set([correct.key])

  const tryAdd = (opt: SbOption) => {
    if (!seen.has(opt.key)) { seen.add(opt.key); pool.push(opt) }
  }

  // Naive reading (most common wrong answer)
  if (!playerAnswer.wash_out && naiveSecs > 0 && naiveSecs !== playerAnswer.correct_secs) {
    tryAdd({ key: String(naiveSecs), label: sbFormatGT(naiveSecs), secs: naiveSecs, isWashOut: false, isCorrect: false })
  }

  // Other players' correct times
  for (const other of allAnswers) {
    if (other.team === playerAnswer.team && other.player === playerAnswer.player) continue
    if (other.already_expired) continue
    if (other.wash_out) {
      tryAdd({ key: 'wo', label: 'Washed Out', secs: null, isWashOut: true, isCorrect: false })
    } else {
      tryAdd({ key: String(other.correct_secs), label: sbFormatGT(other.correct_secs), secs: other.correct_secs, isWashOut: false, isCorrect: false })
    }
  }

  // Wash Out as a distractor if not already correct
  if (!playerAnswer.wash_out) tryAdd({ key: 'wo', label: 'Washed Out', secs: null, isWashOut: true, isCorrect: false })

  // Naive readings of other players' penalties
  for (const other of allAnswers) {
    if (other.team === playerAnswer.team && other.player === playerAnswer.player) continue
    if (other.already_expired) continue
    const oEvt = events.find((e: any) => e.type === 'penalty' && e.team === other.team && e.player === other.player)
    if (oEvt) {
      const oNaive = Math.max(0, sbEventTotalSecs(oEvt) - (oEvt.gt - goalGT))
      if (oNaive > 0) tryAdd({ key: String(oNaive), label: sbFormatGT(oNaive), secs: oNaive, isWashOut: false, isCorrect: false })
    }
  }

  // Shuffle pool and take up to 3 distractors
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 3)
  const all = [correct, ...shuffled].sort(() => Math.random() - 0.5)
  return all
}

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

  // Scoreboard question state — one selection per active (non-expired) player
  const [sbSelections, setSbSelections] = useState<(number | 'wash_out' | null)[]>([])
  const [sbOptions, setSbOptions] = useState<SbOption[][]>([])
  const [sbPlayerCorrect, setSbPlayerCorrect] = useState<boolean[]>([])

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
    setSbSelections([])
    setSbOptions([])
    setSbPlayerCorrect([])

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

    if (q) {
      if (q.question_type === 'compound') {
        setSubShuffledOrders((q.sub_questions ?? []).map((sq: any) => shuffleIndices(sq.options.length)))
      } else if (q.question_type === 'scoreboard') {
        const cfg = q.sub_questions?.[0] as any
        const active = (cfg?.player_answers ?? []).filter((a: any) => !a.already_expired)
        setSbSelections(active.map(() => null))
        setSbOptions(active.map((a: any) => generateSbOptions(a, cfg.player_answers, cfg.events ?? [])))
      } else {
        setShuffledOrder(shuffleIndices(q.options.length))
      }
    }

    setLoading(false)
  }

  function toggleOption(originalIdx: number) {
    if (answerState !== 'unanswered') return
    // For compound, use the current sub-question's answer_type; otherwise the question's
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

    // Record the quiz_answer when the last sub-question is answered.
    // Encode per-sub-question arrays with -1 as a separator so the results
    // page can decode them: [1, -1, 0, 2] → [[1], [0, 2]]
    const isLastSubQ = compoundSubIndex === question.sub_questions.length - 1
    if (isLastSubQ) {
      const overallCorrect = newSubCorrect.every(Boolean)
      const encoded = newSubAnswers.reduce<number[]>((acc, answers, i) => {
        if (i > 0) acc.push(-1)
        return acc.concat(answers)
      }, [])
      await supabase.from('quiz_answers').insert({
        session_id: session.id,
        question_id: question.id,
        selected_answers: encoded,
        is_correct: overallCorrect,
      })
    }
  }

  function advanceSubQuestion() {
    setCompoundSubIndex((i) => i + 1)
    setSelected([])
    setAnswerState('unanswered')
  }

  // ─── Scoreboard question submit ─────────────────────────────────────────────

  async function submitScoreboardAnswer() {
    if (!question || !session) return
    const cfg = question.sub_questions?.[0] as any
    const active = (cfg?.player_answers ?? []).filter((a: any) => !a.already_expired)
    if (sbSelections.some((s) => s === null)) return

    const results = active.map((a: any, i: number) => {
      const sel = sbSelections[i]
      if (a.wash_out) return sel === 'wash_out'
      return sel === a.correct_secs
    })
    const isCorrect = results.every(Boolean)

    setSbPlayerCorrect(results)
    setAnswerState(isCorrect ? 'correct' : 'incorrect')

    // Encode: each player's selection as seconds (or -999 for wash_out), -1 as separator
    const encoded = sbSelections.map((s) => (s === 'wash_out' ? -999 : (s ?? -1)))
    await supabase.from('quiz_answers').insert({
      session_id: session.id,
      question_id: question.id,
      selected_answers: encoded,
      is_correct: isCorrect,
    })
  }

  // ─── Advance to next question_id ────────────────────────────────────────────

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

  // ─── Progress bar (shared) ──────────────────────────────────────────────────

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

        {/* Situation — pinned at top throughout all sub-questions */}
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Situation</p>
          <p className="text-sm text-blue-900 leading-relaxed">{question.text}</p>
        </div>

        {/* Sub-question progress */}
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

        {/* Sub-question */}
        <Card>
          <CardContent className="pt-6">
            <p className="font-medium text-gray-900 text-base leading-relaxed mb-1">
              {subQ.text}
            </p>
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

        {/* Feedback for this sub-question */}
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

        {/* Actions */}
        {answerState === 'unanswered' ? (
          <Button onClick={submitCompoundAnswer} disabled={selected.length === 0} className="w-full" size="lg">
            Submit Answer
          </Button>
        ) : !isLastSubQ ? (
          <Button onClick={advanceSubQuestion} className="w-full" size="lg">
            Next Part →
          </Button>
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
    const cfg = question.sub_questions?.[0] as any
    if (!cfg) return null
    const { period, events = [], player_answers = [] } = cfg
    const active = (player_answers as any[]).filter((a) => !a.already_expired)
    const allAnswered = sbSelections.length === active.length && sbSelections.every((s) => s !== null)

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {progressBar}

        {/* Situation pinned at top */}
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Situation</p>
          <p className="text-sm text-blue-900 leading-relaxed">{question.text}</p>
        </div>

        {/* Events timeline */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Period {period} — Events</p>
            <div className="space-y-1.5">
              {(events as any[]).map((evt, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <span className="font-mono text-gray-400 w-10 shrink-0 pt-px">{sbFormatGT(evt.gt)}</span>
                  {evt.type === 'penalty' ? (
                    <span>
                      <span className={`font-semibold ${evt.team === 'A' ? 'text-blue-700' : 'text-red-700'}`}>
                        Team {evt.team} #{evt.player}
                      </span>
                      {' — '}
                      <span className="text-gray-700">{sbPenaltyLabel(evt)}</span>
                    </span>
                  ) : (
                    <span className="font-semibold text-green-700">
                      Goal — Team {evt.team}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Per-player sub-questions */}
        <div className="space-y-3">
          {active.map((ans: any, i: number) => {
            const opts = sbOptions[i] ?? []
            const sel = sbSelections[i]
            const playerCorrect = sbPlayerCorrect[i]

            return (
              <Card key={i} className={
                answerState === 'unanswered' ? '' :
                playerCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              }>
                <CardContent className="pt-4 pb-4 space-y-3">
                  <p className="text-sm font-medium text-gray-700">
                    What time does the referee communicate for{' '}
                    <span className={`font-semibold ${ans.team === 'A' ? 'text-blue-700' : 'text-red-700'}`}>
                      Team {ans.team} #{ans.player}
                    </span>
                    ?
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    {opts.map((opt) => {
                      const isSelected = sel === (opt.isWashOut ? 'wash_out' : opt.secs)
                      let style = 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                      if (answerState !== 'unanswered') {
                        if (opt.isCorrect) style = 'border-green-500 bg-green-50 text-green-900'
                        else if (isSelected && !opt.isCorrect) style = 'border-red-400 bg-red-50 text-red-900'
                        else style = 'border-gray-100 bg-gray-50 text-gray-400'
                      } else if (isSelected) {
                        style = 'border-slate-900 bg-slate-50 text-slate-900'
                      }

                      return (
                        <button
                          key={opt.key}
                          disabled={answerState !== 'unanswered'}
                          onClick={() => {
                            if (answerState !== 'unanswered') return
                            setSbSelections((prev) => {
                              const next = [...prev]
                              next[i] = opt.isWashOut ? 'wash_out' : opt.secs!
                              return next
                            })
                          }}
                          className={`px-3 py-2.5 rounded-lg border-2 text-sm font-mono font-medium transition-all ${style}`}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>

                  {answerState !== 'unanswered' && !playerCorrect && (
                    <p className="text-xs text-gray-600">
                      Correct: <span className="font-semibold font-mono">{ans.wash_out ? 'Washed Out' : sbFormatGT(ans.correct_secs)}</span>
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Rationale after submit */}
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
          <Button onClick={submitScoreboardAnswer} disabled={!allAnswered} className="w-full" size="lg">
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

  // ─── Standard question render ────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {progressBar}

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
