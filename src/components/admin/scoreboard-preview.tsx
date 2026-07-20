'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SinglePenalty {
  penalty_type: 'minor' | 'double_minor' | 'major' | 'match'
  infraction: string
}

export interface PreviewEvent {
  gt: number           // seconds (already parsed)
  type: 'penalty' | 'goal'
  team: 'A' | 'B'
  player: string
  penalties: SinglePenalty[]
}

export interface PreviewPlayerAnswer {
  team: 'A' | 'B'
  player: string
  correct_secs: number
  wash_out: boolean
  already_expired: boolean
}

export interface ScoreboardPreviewProps {
  period: number
  startGT: number       // seconds
  events: PreviewEvent[]
  playerAnswers: PreviewPlayerAnswer[]
  rationale: string
  ruleNumber: string
  situationType?: 'coincidental' | 'expiration'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PENALTY_SECS: Record<string, number> = {
  minor: 120, double_minor: 240, major: 300, match: 300,
}

function eventTotalSecs(evt: PreviewEvent): number {
  return (evt.penalties ?? []).reduce((s, p) => s + (PENALTY_SECS[p.penalty_type] ?? 120), 0)
}

function penaltyLabel(evt: PreviewEvent): string {
  if (!evt.penalties?.length) return ''
  return evt.penalties.map((p) => {
    const t = p.penalty_type === 'double_minor' ? 'Double Minor'
      : p.penalty_type === 'major' ? 'Major'
      : p.penalty_type === 'match' ? 'Match'
      : 'Minor'
    return p.infraction ? `${t} (${p.infraction})` : t
  }).join(' + ')
}

function fmtGT(secs: number): string {
  const rounded = Math.max(0, Math.round(secs))
  const m = Math.floor(rounded / 60)
  const s = rounded % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function parseInput(str: string): number | null {
  const m = str.trim().match(/^(\d+):(\d{2})$/)
  if (!m) return null
  return parseInt(m[1]) * 60 + parseInt(m[2])
}

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
  const secs = parseInput(result)
  if (secs !== null && secs > 1200) return '20:00'
  return result
}

type Phase = 'ready' | 'fast' | 'real' | 'overlay' | 'question'

interface CombinedPenalties {
  teamA: { player: string; label: string }[]
  teamB: { player: string; label: string }[]
}

type Overlay = { title: string; sub: string | null; isGoal: boolean; combined?: CombinedPenalties }

// ── Component ─────────────────────────────────────────────────────────────────

export function ScoreboardPreview({ period, startGT, events, playerAnswers, rationale, ruleNumber, situationType = 'expiration' }: ScoreboardPreviewProps) {
  const active = playerAnswers.filter((a) => !a.already_expired)
  const goalEvt = events.find((e) => e.type === 'goal')

  const [phase, setPhase] = useState<Phase>('ready')
  const [clockGT, setClockGT] = useState(startGT)
  const [scoreA, setScoreA] = useState(0)
  const [scoreB, setScoreB] = useState(0)
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [log, setLog] = useState<{ gt: number; text: string; isGoal: boolean }[]>([])
  const [inputs, setInputs] = useState<string[]>(active.map(() => ''))
  const [woState, setWoState] = useState<boolean[]>(active.map(() => false))
  const [submitted, setSubmitted] = useState(false)
  const [results, setResults] = useState<boolean[]>([])
  const [answerState, setAnswerState] = useState<'unanswered' | 'correct' | 'incorrect'>('unanswered')

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const gtRef = useRef(startGT)
  const evtIdxRef = useRef(0)
  const groupSizeRef = useRef(1)

  function clearTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  function fireEvent() {
    const start = evtIdxRef.current
    if (start >= events.length) return
    const gt = events[start].gt
    const group: PreviewEvent[] = []
    for (let i = start; i < events.length && events[i].gt === gt; i++) group.push(events[i])
    groupSizeRef.current = group.length

    gtRef.current = gt
    setClockGT(gt)

    setLog((prev) => [
      ...prev,
      ...group.map((e) => ({
        gt: e.gt,
        text: e.type === 'goal' ? `GOAL — Team ${e.team}` : `Team ${e.team} #${e.player} — ${penaltyLabel(e)}`,
        isGoal: e.type === 'goal',
      })),
    ])

    const goalInGroup = group.find((e) => e.type === 'goal')
    if (goalInGroup) {
      if (goalInGroup.team === 'A') setScoreA((s) => s + 1)
      else setScoreB((s) => s + 1)
    }

    const penA = group.filter((e) => e.type === 'penalty' && e.team === 'A')
    const penB = group.filter((e) => e.type === 'penalty' && e.team === 'B')

    if (penA.length > 0 && penB.length > 0) {
      const title = goalInGroup ? 'Goal + Penalties' : 'Penalties'
      setOverlay({
        title,
        sub: null,
        isGoal: !!goalInGroup,
        combined: {
          teamA: penA.map((e) => ({ player: e.player, label: penaltyLabel(e) })),
          teamB: penB.map((e) => ({ player: e.player, label: penaltyLabel(e) })),
        },
      })
    } else if (goalInGroup) {
      setOverlay({ title: `Goal — Team ${goalInGroup.team}`, sub: null, isGoal: true })
    } else {
      const evt = group[0]
      const title = `Penalt${(evt.penalties?.length ?? 0) > 1 ? 'ies' : 'y'} — Team ${evt.team} #${evt.player}`
      setOverlay({ title, sub: penaltyLabel(evt), isGoal: false })
    }

    setPhase('overlay')
  }

  function startReal() {
    setPhase('real')
    timerRef.current = setInterval(() => {
      const nextEvt = events[evtIdxRef.current]
      if (!nextEvt) { clearTimer(); return }
      const newGT = Math.round((gtRef.current - 0.1) * 10) / 10
      if (newGT <= nextEvt.gt) {
        clearTimer(); fireEvent()
      } else {
        gtRef.current = newGT; setClockGT(newGT)
      }
    }, 100)
  }

  function startFast() {
    setPhase('fast')
    timerRef.current = setInterval(() => {
      const nextEvt = events[evtIdxRef.current]
      if (!nextEvt) { clearTimer(); return }
      const gt = gtRef.current
      const until = gt - nextEvt.gt
      if (until <= 3) { clearTimer(); startReal(); return }
      if (until <= 0) { clearTimer(); fireEvent(); return }
      gtRef.current = gt - 1; setClockGT(gt - 1)
    }, 40)
  }

  function onContinue() {
    setOverlay(null)
    evtIdxRef.current += groupSizeRef.current
    groupSizeRef.current = 1
    if (evtIdxRef.current >= events.length) {
      setPhase('question')
    } else {
      startFast()
    }
  }

  function reset() {
    clearTimer()
    setPhase('ready')
    setClockGT(startGT)
    gtRef.current = startGT
    evtIdxRef.current = 0
    setScoreA(0); setScoreB(0)
    setOverlay(null)
    setLog([])
    setInputs(active.map(() => ''))
    setWoState(active.map(() => false))
    setSubmitted(false)
    setResults([])
    setAnswerState('unanswered')
    groupSizeRef.current = 1
  }

  function toggleWo(i: number) {
    if (submitted) return
    const on = !woState[i]
    setWoState((prev) => { const n = [...prev]; n[i] = on; return n })
    if (on) setInputs((prev) => { const n = [...prev]; n[i] = ''; return n })
  }

  function submit() {
    const res = active.map((a, i) => {
      if (a.wash_out) return woState[i]
      if (woState[i]) return false
      const s = parseInput(inputs[i])
      return s !== null && s === a.correct_secs
    })
    setResults(res)
    setSubmitted(true)
    setAnswerState(res.every(Boolean) ? 'correct' : 'incorrect')
  }

  // ── Derived: fired penalty slots ───────────────────────────────────────────
  const finalGT = events.length > 0 ? Math.min(...events.map((e) => e.gt)) : -1
  const firedPenalties = events.filter((e) => {
    if (e.type !== 'penalty') return false
    if (clockGT > e.gt) return false
    if (situationType === 'coincidental' && e.gt === finalGT) return false
    return true
  })
  const penA = firedPenalties.filter((e) => e.team === 'A')
  const penB = firedPenalties.filter((e) => e.team === 'B')

  function getPenRemaining(evt: PreviewEvent): number {
    return Math.max(0, eventTotalSecs(evt) - (evt.gt - clockGT))
  }

  function renderSlot(pen: PreviewEvent | null) {
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
            {penaltyLabel(pen)}
          </span>
        </span>
        <span className="text-[12px] tabular-nums font-medium text-amber-400 shrink-0">
          {fmtGT(getPenRemaining(pen))}
        </span>
      </div>
    )
  }

  const promptText = goalEvt
    ? `Team ${goalEvt.team} scores. Communicate the penalty clock times to the timekeeper.`
    : 'Communicate the penalty clock times to the timekeeper.'

  const allFilled = active.every((_, i) => woState[i] || parseInput(inputs[i]) !== null)

  return (
    <div className="space-y-4">
      {/* ── Scoreboard ── */}
      <div className="rounded-[14px] overflow-hidden relative" style={{ background: '#0c1420' }}>

        {/* Overlay */}
        {overlay && (
          <div
            className="absolute inset-0 rounded-[14px] z-20 flex flex-col items-center justify-center px-6 py-5"
            style={{
              background: overlay.isGoal ? 'rgba(4,14,8,0.88)' : 'rgba(8,16,28,0.85)',
              backdropFilter: 'blur(3px)',
            }}
          >
            <div className="text-3xl mb-1">{overlay.isGoal ? '🚨' : '📋'}</div>
            <div className={`text-sm font-medium text-center mb-3 ${overlay.isGoal ? 'text-green-300' : 'text-amber-300'}`}>
              {overlay.title}
            </div>
            {overlay.combined ? (
              <div className="w-full grid grid-cols-2 gap-4 mb-4 px-2">
                <div>
                  <div className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'rgba(96,165,250,0.6)' }}>Team A</div>
                  {overlay.combined.teamA.map((p, i) => (
                    <div key={i} className="mb-1">
                      <span className="text-[12px] font-medium text-white">#{p.player}</span>
                      <div className="text-[10px] leading-snug" style={{ color: 'rgba(255,255,255,0.45)' }}>{p.label}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'rgba(248,113,113,0.6)' }}>Team B</div>
                  {overlay.combined.teamB.map((p, i) => (
                    <div key={i} className="mb-1">
                      <span className="text-[12px] font-medium text-white">#{p.player}</span>
                      <div className="text-[10px] leading-snug" style={{ color: 'rgba(255,255,255,0.45)' }}>{p.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : overlay.sub ? (
              <div className="text-[11px] text-center mb-4 leading-relaxed whitespace-pre-line" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {overlay.sub}
              </div>
            ) : null}
            <button
              onClick={onContinue}
              className="px-5 py-1.5 text-sm rounded-lg transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }}
            >
              Continue →
            </button>
          </div>
        )}

        {/* Period | Clock */}
        <div className="grid items-center px-4 py-2.5" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
          <div>
            <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Period</div>
            <div className="text-[17px]" style={{ color: 'rgba(255,255,255,0.7)' }}>{period}</div>
          </div>
          <div className="text-center">
            <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Time Remaining</div>
            <div
              className="text-5xl font-light tracking-widest tabular-nums transition-all"
              style={{ color: phase === 'fast' ? '#93c5fd' : 'white', opacity: phase === 'fast' ? 0.45 : 1 }}
            >
              {fmtGT(clockGT)}
            </div>
          </div>
          <div />
        </div>

        {/* Score row */}
        <div className="grid items-center px-5 py-1.5" style={{ gridTemplateColumns: '1fr auto 1fr', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-[12px] font-medium uppercase tracking-widest text-blue-400">Team A</div>
          <div className="text-[1.4rem] font-light text-white tracking-widest tabular-nums text-center px-4">
            {scoreA} <span style={{ color: 'rgba(255,255,255,0.25)' }}>–</span> {scoreB}
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
        <div className="text-[10px] uppercase tracking-widest font-medium text-gray-400 mb-2">Period {period} — Events</div>
        {log.length === 0 ? (
          <div className="text-[11px] text-gray-300">No events yet</div>
        ) : (
          <div className="space-y-1">
            {log.map((entry, i) => (
              <div key={i} className="flex gap-2 items-baseline text-[12px]">
                <span className="tabular-nums text-[11px] text-gray-400 shrink-0 min-w-[28px]">{fmtGT(entry.gt)}</span>
                <span className={entry.isGoal ? 'text-green-700 font-medium' : 'text-gray-700'}>{entry.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Start button */}
      {phase === 'ready' && (
        <Button onClick={startFast} className="w-full">▶ Start Simulation</Button>
      )}

      {/* Answer section */}
      {phase === 'question' && (
        <div className="space-y-3">
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">{promptText}</p>
              {active.map((ans, i) => {
                const isCorrect = results[i]
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg ${
                      submitted ? (isCorrect ? 'bg-green-50' : 'bg-red-50') : 'bg-gray-50'
                    }`}
                  >
                    <span className={`text-sm font-semibold shrink-0 w-14 ${ans.team === 'A' ? 'text-blue-700' : 'text-red-700'}`}>
                      {ans.team} #{ans.player}
                    </span>
                    <input
                      type="text"
                      value={woState[i] ? '' : inputs[i]}
                      onChange={(e) => {
                        if (submitted || woState[i]) return
                        const masked = maskGameTime(e.target.value)
                        setInputs((prev) => { const n = [...prev]; n[i] = masked; return n })
                      }}
                      disabled={submitted || woState[i]}
                      placeholder="m:ss"
                      className="flex-1 border border-gray-300 rounded-md px-2.5 py-1.5 text-sm font-mono tabular-nums bg-white focus:outline-none focus:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                    <button
                      onClick={() => toggleWo(i)}
                      disabled={submitted}
                      className={`px-3 py-1.5 text-xs rounded-md border transition-all shrink-0 ${
                        woState[i] ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {situationType === 'coincidental' ? 'Coincidental Penalty' : 'Wash Out'}
                    </button>
                    {submitted && (
                      <span className={`text-sm font-bold shrink-0 ${isCorrect ? 'text-green-600' : 'text-red-500'}`}>
                        {isCorrect ? '✓' : '✗'}
                      </span>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {submitted && (
            <Card className={answerState === 'correct' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
              <CardContent className="pt-4 pb-4 space-y-2">
                <p className={`font-semibold ${answerState === 'correct' ? 'text-green-800' : 'text-red-800'}`}>
                  {answerState === 'correct' ? '✅ Correct!' : '❌ Not quite.'}
                </p>
                {rationale && (
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">📖 Rationale: </span>{rationale}
                  </p>
                )}
                {ruleNumber && (
                  <p className="text-sm text-gray-500">
                    <span className="font-medium">📋 Rule {ruleNumber}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2">
            {!submitted ? (
              <Button onClick={submit} disabled={!allFilled} className="flex-1">Submit Answer</Button>
            ) : (
              <div className="flex-1" />
            )}
            <Button variant="outline" onClick={reset}>↺ Replay</Button>
          </div>
        </div>
      )}

      {/* Replay during non-question phases */}
      {phase !== 'ready' && phase !== 'question' && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={reset}>↺ Reset</Button>
        </div>
      )}
    </div>
  )
}
