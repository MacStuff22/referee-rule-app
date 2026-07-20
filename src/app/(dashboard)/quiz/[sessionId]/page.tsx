'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Question, QuizSession } from '@/types'

type AnswerState = 'unanswered' | 'correct' | 'incorrect'
type SbPhase = 'ready' | 'fast' | 'real' | 'overlay' | 'question'

// ─── Scoreboard helpers ──────────────────────────────────────────────────────

function sbFormatGT(secs: number): string {
  const rounded = Math.max(0, Math.round(secs))
  const m = Math.floor(rounded / 60)
  const s = rounded % 60
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

function parseGTInput(str: string): number | null {
  const m = str.trim().match(/^(\d+):(\d{2})$/)
  if (!m) return null
  return parseInt(m[1]) * 60 + parseInt(m[2])
}

// Smart game-time mask: digits only, colon auto-inserted, 20:00 max, 59s max
function maskGameTime(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4)
  if (!d) return ''
  let result: string
  if (d.length === 1) result = `0:0${d}`
  else if (d.length === 2) result = `0:${d}`
  else if (d.length === 3) result = `${d[0]}:${d.slice(1)}`
  else {
    const mins = parseInt(d.slice(0, 2), 10)
    result = `${mins}:${d.slice(2)}`
  }
  const secs = parseGTInput(result)
  if (secs !== null && secs > 1200) return '20:00'
  return result
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

  // Scoreboard question state
  const [sbPhase, setSbPhase] = useState<SbPhase>('ready')
  const [sbClockGT, setSbClockGT] = useState(0)
  const [sbOverlay, setSbOverlay] = useState<{ title: string; sub: string | null; isGoal: boolean } | null>(null)
  const [sbLog, setSbLog] = useState<{ gt: number; text: string; isGoal: boolean }[]>([])
  const [sbScoreA, setSbScoreA] = useState(0)
  const [sbScoreB, setSbScoreB] = useState(0)
  const [sbPlayerCorrect, setSbPlayerCorrect] = useState<boolean[]>([])
  const [sbInputs, setSbInputs] = useState<string[]>([])
  const [sbWoState, setSbWoState] = useState<boolean[]>([])
  const [sbSubmitted, setSbSubmitted] = useState(false)
  const sbTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sbGTRef = useRef(0)
  const sbEvtIdxRef = useRef(0)
  const sbCfgRef = useRef<any>(null)

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
    setSbPhase('ready')
    setSbClockGT(0)
    setSbOverlay(null)
    setSbLog([])
    setSbScoreA(0)
    setSbScoreB(0)
    setSbPlayerCorrect([])
    setSbInputs([])
    setSbWoState([])
    setSbSubmitted(false)
    sbGTRef.current = 0
    sbEvtIdxRef.current = 0
    sbCfgRef.current = null
    if (sbTimerRef.current) { clearInterval(sbTimerRef.current); sbTimerRef.current = null }

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
        sbCfgRef.current = cfg
        sbGTRef.current = cfg?.start_gt ?? 0
        setSbClockGT(cfg?.start_gt ?? 0)
        setSbInputs(active.map(() => ''))
        setSbWoState(active.map(() => false))
        setSbPhase('ready')
      } else {
        setShuffledOrder(shuffleIndices(q.options.length))
      }
    }

    setLoading(false)
  }

  // ─── Scoreboard simulation ──────────────────────────────────────────────────

  function fireSbEvent() {
    const events = sbCfgRef.current?.events ?? []
    const evt = events[sbEvtIdxRef.current]
    if (!evt) return
    sbGTRef.current = evt.gt
    setSbClockGT(evt.gt)
    const isGoal = evt.type === 'goal'
    const title = isGoal
      ? `Goal — Team ${evt.team}`
      : `Penalt${(evt.penalties?.length ?? 0) > 1 ? 'ies' : 'y'} — Team ${evt.team} #${evt.player}`
    const sub = isGoal ? null : sbPenaltyLabel(evt)
    if (isGoal) {
      if (evt.team === 'A') setSbScoreA((s) => s + 1)
      else setSbScoreB((s) => s + 1)
    }
    setSbLog((prev) => [...prev, {
      gt: evt.gt,
      text: isGoal
        ? `GOAL — Team ${evt.team}`
        : `Team ${evt.team} #${evt.player} — ${sbPenaltyLabel(evt)}`,
      isGoal,
    }])
    setSbOverlay({ title, sub, isGoal })
    setSbPhase('overlay')
  }

  function startSbReal() {
    setSbPhase('real')
    sbTimerRef.current = setInterval(() => {
      const events = sbCfgRef.current?.events ?? []
      const nextEvt = events[sbEvtIdxRef.current]
      if (!nextEvt) { clearInterval(sbTimerRef.current!); sbTimerRef.current = null; return }
      const newGT = Math.round((sbGTRef.current - 0.1) * 10) / 10
      if (newGT <= nextEvt.gt) {
        clearInterval(sbTimerRef.current!); sbTimerRef.current = null
        fireSbEvent()
      } else {
        sbGTRef.current = newGT
        setSbClockGT(newGT)
      }
    }, 100)
  }

  function startSbFast() {
    setSbPhase('fast')
    sbTimerRef.current = setInterval(() => {
      const events = sbCfgRef.current?.events ?? []
      const nextEvt = events[sbEvtIdxRef.current]
      if (!nextEvt) { clearInterval(sbTimerRef.current!); sbTimerRef.current = null; return }
      const gt = sbGTRef.current
      const until = gt - nextEvt.gt
      if (until <= 3) {
        clearInterval(sbTimerRef.current!); sbTimerRef.current = null
        startSbReal()
        return
      }
      if (until <= 0) {
        clearInterval(sbTimerRef.current!); sbTimerRef.current = null
        fireSbEvent()
        return
      }
      sbGTRef.current = gt - 1
      setSbClockGT(gt - 1)
    }, 40)
  }

  function onSbContinue() {
    setSbOverlay(null)
    sbEvtIdxRef.current++
    const events = sbCfgRef.current?.events ?? []
    if (sbEvtIdxRef.current >= events.length) {
      setSbPhase('question')
    } else {
      startSbFast()
    }
  }

  function toggleSbWo(i: number) {
    if (sbSubmitted) return
    const turningOn = !sbWoState[i]
    setSbWoState((prev) => { const n = [...prev]; n[i] = turningOn; return n })
    if (turningOn) setSbInputs((prev) => { const n = [...prev]; n[i] = ''; return n })
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
    const results = active.map((a: any, i: number) => {
      if (a.wash_out) return sbWoState[i]
      if (sbWoState[i]) return false
      const inputSecs = parseGTInput(sbInputs[i])
      return inputSecs !== null && inputSecs === a.correct_secs
    })
    const isCorrect = results.every(Boolean)
    setSbPlayerCorrect(results)
    setSbSubmitted(true)
    setAnswerState(isCorrect ? 'correct' : 'incorrect')
    const encoded = active.map((_: any, i: number) => {
      if (sbWoState[i]) return -999
      return parseGTInput(sbInputs[i]) ?? -1
    })
    await supabase.from('quiz_answers').insert({
      session_id: session.id,
      question_id: question.id,
      selected_answers: encoded,
      is_correct: isCorrect,
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
    const cfg = question.sub_questions?.[0] as any
    if (!cfg) return null
    const { period, events = [], player_answers = [] } = cfg
    const active = (player_answers as any[]).filter((a: any) => !a.already_expired)
    const goalEvt = (events as any[]).find((e: any) => e.type === 'goal')
    const allFilled = active.every((_: any, i: number) => sbWoState[i] || parseGTInput(sbInputs[i]) !== null)

    // Penalty slots: events that have been called (clock at or below event's gt)
    const firedPenalties = (events as any[]).filter((e: any) => e.type === 'penalty' && sbClockGT <= e.gt)
    const penA = firedPenalties.filter((e: any) => e.team === 'A')
    const penB = firedPenalties.filter((e: any) => e.team === 'B')

    function getPenRemaining(evt: any): number {
      return Math.max(0, sbEventTotalSecs(evt) - (evt.gt - sbClockGT))
    }

    function renderSlot(pen: any | null) {
      if (!pen) {
        return (
          <div className="flex items-center justify-between min-h-[1.65rem] mb-0.5 px-1.5 py-0.5 rounded-md">
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.18)' }}>—</span>
            <span className="text-[12px] tabular-nums" style={{ color: 'rgba(255,255,255,0.18)' }}>—</span>
          </div>
        )
      }
      return (
        <div className="flex items-center justify-between min-h-[1.65rem] mb-0.5 px-1.5 py-0.5 rounded-md">
          <span className="text-[11px] truncate mr-2" style={{ color: 'rgba(255,255,255,0.78)' }}>
            {pen.team} #{pen.player}
            <span className="ml-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {sbPenaltyLabel(pen)}
            </span>
          </span>
          <span className="text-[12px] tabular-nums font-medium text-amber-400 shrink-0">
            {sbFormatGT(getPenRemaining(pen))}
          </span>
        </div>
      )
    }

    const promptText = goalEvt
      ? `Team ${goalEvt.team} scores. Communicate the penalty clock times to the timekeeper.`
      : 'Communicate the penalty clock times to the timekeeper.'

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {progressBar}

        {/* Situation */}
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Situation</p>
          <p className="text-sm text-blue-900 leading-relaxed">{question.text}</p>
        </div>

        {/* ── NHL-style scoreboard ── */}
        <div className="rounded-[14px] overflow-hidden relative" style={{ background: '#0c1420' }}>

          {/* Event overlay */}
          {sbOverlay && (
            <div
              className="absolute inset-0 rounded-[14px] z-20 flex flex-col items-center justify-center px-6 py-5"
              style={{
                background: sbOverlay.isGoal ? 'rgba(4,14,8,0.88)' : 'rgba(8,16,28,0.85)',
                backdropFilter: 'blur(3px)',
              }}
            >
              <div className="text-3xl mb-1">{sbOverlay.isGoal ? '🚨' : '📋'}</div>
              <div className={`text-sm font-medium text-center mb-2 ${sbOverlay.isGoal ? 'text-green-300' : 'text-amber-300'}`}>
                {sbOverlay.title}
              </div>
              {sbOverlay.sub && (
                <div className="text-[11px] text-center mb-4 leading-relaxed whitespace-pre-line" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {sbOverlay.sub}
                </div>
              )}
              <button
                onClick={onSbContinue}
                className="px-5 py-1.5 text-sm rounded-lg transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }}
              >
                Continue →
              </button>
            </div>
          )}

          {/* Top: Period | Clock | (empty) */}
          <div className="grid items-center px-4 py-2.5" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
            <div>
              <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Period</div>
              <div className="text-[17px]" style={{ color: 'rgba(255,255,255,0.7)' }}>{period}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Time Remaining</div>
              <div
                className="text-5xl font-light tracking-widest tabular-nums transition-all"
                style={{
                  color: sbPhase === 'fast' ? '#93c5fd' : 'white',
                  opacity: sbPhase === 'fast' ? 0.45 : 1,
                }}
              >
                {sbFormatGT(sbClockGT)}
              </div>
            </div>
            <div />
          </div>

          {/* Score row */}
          <div
            className="grid items-center px-5 py-1.5"
            style={{ gridTemplateColumns: '1fr auto 1fr', borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="text-[12px] font-medium uppercase tracking-widest text-blue-400">Team A</div>
            <div className="text-[1.4rem] font-light text-white tracking-widest tabular-nums text-center px-4">
              {sbScoreA} <span style={{ color: 'rgba(255,255,255,0.25)' }}>–</span> {sbScoreB}
            </div>
            <div className="text-[12px] font-medium uppercase tracking-widest text-red-400 text-right">Team B</div>
          </div>

          {/* Penalty grid */}
          <div className="grid grid-cols-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="px-3.5 py-2.5" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'rgba(96,165,250,0.5)' }}>Team A</div>
              {renderSlot(penA[0] ?? null)}
              {renderSlot(penA[1] ?? null)}
            </div>
            <div className="px-3.5 py-2.5">
              <div className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'rgba(248,113,113,0.5)' }}>Team B</div>
              {renderSlot(penB[0] ?? null)}
              {renderSlot(penB[1] ?? null)}
            </div>
          </div>
        </div>

        {/* Event log */}
        <div className="rounded-xl border border-gray-100 bg-white px-3.5 py-3">
          <div className="text-[10px] uppercase tracking-widest font-medium text-gray-400 mb-2">
            Period {period} — Events
          </div>
          {sbLog.length === 0 ? (
            <div className="text-[11px] text-gray-300">No events yet</div>
          ) : (
            <div className="space-y-1">
              {sbLog.map((entry, i) => (
                <div key={i} className="flex gap-2 items-baseline text-[12px]">
                  <span className="tabular-nums text-[11px] text-gray-400 shrink-0 min-w-[28px]">{sbFormatGT(entry.gt)}</span>
                  <span className={entry.isGoal ? 'text-green-700 font-medium' : 'text-gray-700'}>{entry.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Start button */}
        {sbPhase === 'ready' && (
          <Button onClick={startSbFast} className="w-full" size="lg">
            ▶ Start Simulation
          </Button>
        )}

        {/* Answer section — appears after last event is continued */}
        {sbPhase === 'question' && (
          <div className="space-y-3">
            <Card>
              <CardContent className="pt-4 pb-4 space-y-3">
                <p className="text-sm font-medium text-gray-700">{promptText}</p>
                {active.map((ans: any, i: number) => {
                  const isCorrect = sbPlayerCorrect[i]
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg ${
                        sbSubmitted ? (isCorrect ? 'bg-green-50' : 'bg-red-50') : 'bg-gray-50'
                      }`}
                    >
                      <span className={`text-sm font-semibold shrink-0 w-14 ${ans.team === 'A' ? 'text-blue-700' : 'text-red-700'}`}>
                        {ans.team} #{ans.player}
                      </span>
                      <input
                        type="text"
                        value={sbWoState[i] ? '' : sbInputs[i]}
                        onChange={(e) => {
                          if (sbSubmitted || sbWoState[i]) return
                          const masked = maskGameTime(e.target.value)
                          setSbInputs((prev) => { const n = [...prev]; n[i] = masked; return n })
                        }}
                        disabled={sbSubmitted || sbWoState[i]}
                        placeholder="m:ss"
                        className="flex-1 border border-gray-300 rounded-md px-2.5 py-1.5 text-sm font-mono tabular-nums bg-white focus:outline-none focus:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                      <button
                        onClick={() => toggleSbWo(i)}
                        disabled={sbSubmitted}
                        className={`px-3 py-1.5 text-xs rounded-md border transition-all shrink-0 ${
                          sbWoState[i]
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400'
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        Wash Out
                      </button>
                      {sbSubmitted && (
                        <span className={`text-sm font-bold shrink-0 ${isCorrect ? 'text-green-600' : 'text-red-500'}`}>
                          {isCorrect ? '✓' : '✗'}
                        </span>
                      )}
                      {sbSubmitted && !isCorrect && (
                        <span className="text-xs text-gray-500 shrink-0 font-mono">
                          {ans.wash_out ? 'Wash Out' : sbFormatGT(ans.correct_secs)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {sbSubmitted && (
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

            {!sbSubmitted ? (
              <Button onClick={submitScoreboardAnswer} disabled={!allFilled} className="w-full" size="lg">
                Submit Answer
              </Button>
            ) : (
              <Button onClick={nextQuestion} className="w-full" size="lg">
                {isLastQuestion ? 'See Results' : 'Next Question →'}
              </Button>
            )}
          </div>
        )}
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
                      <div key={i} className="px-3 py-2 text-sm">
                        <span className="font-bold text-slate-700">#{e.player}</span>
                        <span className="text-slate-500 ml-2">{e.penalties}</span>
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
