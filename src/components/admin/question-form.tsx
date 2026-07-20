'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScoreboardPreview } from '@/components/admin/scoreboard-preview'
import type { Question, SubQuestion } from '@/types'

function AutoResizeTextarea({ value, onChange, placeholder, className, minHeight }: {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  className?: string
  minHeight?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(el.scrollHeight, minHeight ?? 0) + 'px'
  }, [minHeight])
  useEffect(() => { resize() }, [value, resize])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => { onChange(e.target.value); resize() }}
      placeholder={placeholder}
      style={{ minHeight: minHeight ? `${minHeight}px` : undefined }}
      className={`w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none overflow-hidden leading-5 ${className ?? ''}`}
    />
  )
}

// ── Scoreboard types ──────────────────────────────────────────────────────────

interface SinglePenalty {
  penalty_type: 'minor' | 'double_minor' | 'major' | 'match'
  infraction: string  // optional, e.g. "Cross-checking"
}

const PENALTY_DURATIONS: Record<SinglePenalty['penalty_type'], number> = {
  minor: 120,
  double_minor: 240,
  major: 300,
  match: 300,
}

const PENALTY_DISPLAY: Record<SinglePenalty['penalty_type'], string> = {
  minor: 'Minor',
  double_minor: 'Double Minor',
  major: 'Major',
  match: 'Match',
}

interface ScoreboardEvent {
  gt: string  // raw user input, e.g. "3:18" — parsed to seconds only on save
  type: 'penalty' | 'goal'
  team: 'A' | 'B'
  player: string
  penalties: SinglePenalty[]  // one entry for single; multiple for combined (e.g. minor + major)
}

interface ScoreboardPlayerAnswer {
  team: 'A' | 'B'
  player: string
  correct_gt: string   // raw typed string, e.g. "1:34"; parsed to correct_secs on save
  correct_secs: number // derived on save from correct_gt
  wash_out: boolean
  already_expired: boolean  // penalty expired before the key event; not shown as answer option
}

function parseGT(s: string): number {
  const m = s.trim().match(/^(\d+):(\d{2})$/)
  if (!m) return 0
  return parseInt(m[1]) * 60 + parseInt(m[2])
}

function formatGT(secs: number): string {
  const m = Math.floor(Math.abs(secs) / 60)
  const s = Math.abs(secs) % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function gtSecondsValid(s: string): boolean {
  const m = s.match(/^(\d+):(\d{2})$/)
  if (!m) return true
  return parseInt(m[2], 10) <= 59
}

// Smart game-time mask: digits only, colon auto-inserted
// 1 digit → 0:0X, 2 → 0:XX, 3 → X:XX, 4 → XX:XX, max 20:00
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
  if (parseGT(result) > 1200) return '20:00'
  return result
}

function emptyEvent(): ScoreboardEvent {
  return { gt: '', type: 'penalty', team: 'A', player: '', penalties: [{ penalty_type: 'minor', infraction: '' }] }
}

function emptyPlayerAnswer(): ScoreboardPlayerAnswer {
  return { team: 'A', player: '', correct_gt: '', correct_secs: 0, wash_out: false, already_expired: false }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HANDBOOK_SECTIONS = [
  'Section 1 – Playing Area',
  'Section 2 – Teams',
  'Section 3 – Equipment',
  'Section 4 – Types of Penalties',
  'Section 5 – Officials',
  'Section 6 – Physical Infractions',
  'Section 7 – Restraining Infractions',
  'Section 8 – Stick Infractions',
  'Section 9 – Other Infractions',
  'Section 10 – Game Flow',
  'Miscellaneous',
]

const CATEGORIES = [
  // Section 1 – Playing Area
  'Rink',
  'Goal Posts and Nets',
  'Benches',
  'Signal and Timing Devices',
  // Section 2 – Teams
  'Teams',
  'Captain / Alternate Captains',
  'Starting Line-up',
  'Injured Players',
  // Section 3 – Equipment
  'Uniforms / Player Equipment',
  'Sticks',
  'Goalkeeper Equipment',
  'Illegal Equipment',
  'Puck',
  'Equipment Adjustment',
  // Section 4 – Types of Penalties
  'Calling of Penalties',
  'Minor Penalties',
  'Bench Minor Penalties',
  'Double-Minor Penalties',
  'Coincidental Penalties',
  'Major Penalties',
  'Match Penalties',
  'Misconduct Penalties',
  'Game Misconduct Penalties',
  'Penalty Shot',
  'Awarded Goals',
  'Delayed Penalties',
  'Goalkeeper Penalties',
  'Supplementary Discipline',
  'Signals',
  // Section 5 – Officials
  'Referees',
  'Linespersons',
  'In-Arena Scorer',
  'Game Timekeeper',
  'Penalty Timekeeper',
  'Real Time Scorers',
  'Video Review',
  "Coach's Challenge",
  'Abuse of Officials',
  'Physical Abuse of Officials',
  // Section 6 – Physical Infractions
  'Boarding',
  'Charging',
  'Checking from Behind',
  'Clipping',
  'Elbowing',
  'Fighting',
  'Head-butting',
  'Illegal Check to the Head',
  'Kicking',
  'Kneeing',
  'Roughing',
  'Slew-footing',
  'Throwing Equipment',
  // Section 7 – Restraining Infractions
  'Holding',
  'Hooking',
  'Interference',
  'Tripping',
  // Section 8 – Stick Infractions
  'Butt-ending',
  'Cross-checking',
  'High-sticking',
  'Slashing',
  'Spearing',
  // Section 9 – Other Infractions
  'Delaying the Game',
  'Diving / Embellishment',
  'Equipment Violation',
  'Forfeit of Game',
  'Handling Puck',
  'Illegal Substitution',
  'Interference on Goalkeeper',
  'Leaving the Bench',
  'Premature Substitution',
  'Refusing to Play / Start',
  'Too Many Men on the Ice',
  'Unsportsmanlike Conduct',
  // Section 10 – Game Flow
  'Face-offs',
  'Game and Intermission Timing',
  'Goals',
  'Hand Pass',
  'High-sticking the Puck',
  'Icing',
  'Line Changes',
  'Off-side',
  'Overtime',
  'Puck Out of Bounds',
  'Start of Game / Periods',
  'Time-outs',
  // Misc
  'Miscellaneous',
]

interface SubQuestionDraft {
  text: string
  answer_type: 'multiple_choice' | 'multi_select'
  options: string[]
  correct_answers: number[]
  rationale: string
}

function emptySubQuestion(): SubQuestionDraft {
  return { text: '', answer_type: 'multiple_choice', options: ['', '', '', ''], correct_answers: [], rationale: '' }
}

function toSubDraft(sq: SubQuestion): SubQuestionDraft {
  const opts = [...sq.options]
  while (opts.length < 4) opts.push('')
  return { text: sq.text, answer_type: sq.answer_type ?? 'multiple_choice', options: opts, correct_answers: sq.correct_answers, rationale: sq.rationale }
}

interface Props {
  question?: Question
}

export default function QuestionForm({ question }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  const [backUrl, setBackUrl] = useState('/admin/questions')
  const [nextId, setNextId] = useState<string | null>(null)
  const [nextPosition, setNextPosition] = useState<{ current: number; total: number } | null>(null)

  useEffect(() => {
    if (!question?.id) return
    try {
      const raw = sessionStorage.getItem('question_queue')
      if (!raw) return
      const { ids, backUrl: url } = JSON.parse(raw) as { ids: string[]; backUrl: string }
      if (url) setBackUrl(url)
      const idx = ids.indexOf(question.id)
      if (idx !== -1) {
        setNextPosition({ current: idx + 1, total: ids.length })
        if (idx < ids.length - 1) setNextId(ids[idx + 1])
      }
    } catch {
      // sessionStorage unavailable or malformed
    }
  }, [question?.id])

  type Mode = 'multiple_choice' | 'multi_select' | 'compound' | 'scoreboard'

  function initialMode(): Mode {
    if (question?.question_type === 'scoreboard') return 'scoreboard'
    if (question?.question_type === 'compound') return 'compound'
    if (question?.answer_type === 'multi_select') return 'multi_select'
    return 'multiple_choice'
  }

  const [mode, setMode] = useState<Mode>(initialMode)

  // Shared metadata
  const [text, setText] = useState(question?.text ?? '')
  const [ruleRefs, setRuleRefs] = useState<string[]>(
    question?.rule_references?.length ? question.rule_references : (question?.rule_number ? [question.rule_number] : [''])
  )
  const [handbookSection, setHandbookSection] = useState(question?.handbook_section ?? '')
  const [situationId, setSituationId] = useState(question?.situation_id ?? '')
  const [league, setLeague] = useState<'NHL' | 'AHL' | 'both'>(question?.league ?? 'both')
  const [category, setCategory] = useState(question?.category ?? '')
  const [isApproved, setIsApproved] = useState(question?.is_approved ?? false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Standard question fields
  const [options, setOptions] = useState<string[]>(question?.options?.length ? question.options : ['', '', '', ''])
  const [correctAnswers, setCorrectAnswers] = useState<number[]>(question?.correct_answers ?? [])
  const [rationale, setRationale] = useState(question?.rationale ?? '')

  // Compound sub-questions
  const [subQuestions, setSubQuestions] = useState<SubQuestionDraft[]>(
    question?.question_type === 'compound' && question?.sub_questions?.length
      ? question.sub_questions.map(toSubDraft)
      : [emptySubQuestion(), emptySubQuestion()]
  )

  // Scoreboard fields
  const sbConfig = question?.question_type === 'scoreboard' ? (question.sub_questions?.[0] as any) : null
  const [sbPreviewOpen, setSbPreviewOpen] = useState(false)
  const [sbPeriod, setSbPeriod] = useState<1 | 2 | 3 | 4>(sbConfig?.period ?? 3)
  const [sbStartGT, setSbStartGT] = useState(sbConfig?.start_gt ? formatGT(sbConfig.start_gt) : '3:22')
  const [sbEvents, setSbEvents] = useState<ScoreboardEvent[]>(
    sbConfig?.events
      ? sbConfig.events.map((e: any) => ({ ...e, gt: typeof e.gt === 'number' ? formatGT(e.gt) : (e.gt ?? '') }))
      : []
  )
  const [sbPlayerAnswers, setSbPlayerAnswers] = useState<ScoreboardPlayerAnswer[]>(
    sbConfig?.player_answers
      ? sbConfig.player_answers.map((a: any) => ({
          ...a,
          correct_gt: a.correct_gt ?? (a.correct_secs > 0 ? formatGT(a.correct_secs) : ''),
          already_expired: a.already_expired ?? false,
        }))
      : []
  )

  // Keep Correct Answers fully in sync with penalty events — team/player come from the event
  useEffect(() => {
    if (mode !== 'scoreboard') return
    const penaltyEvts = sbEvents.filter((e) => e.type === 'penalty' && e.player.trim())
    setSbPlayerAnswers((prev) =>
      penaltyEvts.map((evt, idx) => ({
        team: evt.team,
        player: evt.player.trim(),
        correct_gt: prev[idx]?.correct_gt ?? '',
        correct_secs: prev[idx]?.correct_secs ?? 0,
        wash_out: prev[idx]?.wash_out ?? false,
        already_expired: prev[idx]?.already_expired ?? false,
      }))
    )
  }, [sbEvents, mode])

  // ── Standard question helpers ─────────────────────────────────────────────

  function updateOption(i: number, val: string) {
    const u = [...options]; u[i] = val; setOptions(u)
  }
  function addOption() { setOptions([...options, '']) }
  function removeOption(i: number) {
    setOptions(options.filter((_, x) => x !== i))
    setCorrectAnswers(correctAnswers.filter((x) => x !== i).map((x) => x > i ? x - 1 : x))
  }
  function toggleCorrect(i: number) {
    if (mode === 'multiple_choice') {
      setCorrectAnswers([i])
    } else {
      setCorrectAnswers((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i])
    }
  }

  // ── Rule reference helpers ───────────────────────────────────────────────

  function updateRuleRef(i: number, val: string) {
    const u = [...ruleRefs]; u[i] = val; setRuleRefs(u)
  }
  function addRuleRef() { setRuleRefs([...ruleRefs, '']) }
  function removeRuleRef(i: number) {
    if (ruleRefs.length === 1) return
    setRuleRefs(ruleRefs.filter((_, x) => x !== i))
  }

  // ── Compound helpers ─────────────────────────────────────────────────────

  function updateSubField<K extends keyof SubQuestionDraft>(sqIdx: number, key: K, val: SubQuestionDraft[K]) {
    setSubQuestions((prev) => prev.map((sq, i) => i === sqIdx ? { ...sq, [key]: val } : sq))
  }

  function updateSubOption(sqIdx: number, optIdx: number, val: string) {
    setSubQuestions((prev) => prev.map((sq, i) => {
      if (i !== sqIdx) return sq
      const opts = [...sq.options]; opts[optIdx] = val
      return { ...sq, options: opts }
    }))
  }

  function toggleSubCorrect(sqIdx: number, optIdx: number) {
    setSubQuestions((prev) => prev.map((sq, i) => {
      if (i !== sqIdx) return sq
      if (sq.answer_type === 'multiple_choice') {
        return { ...sq, correct_answers: [optIdx] }
      } else {
        const already = sq.correct_answers.includes(optIdx)
        return { ...sq, correct_answers: already ? sq.correct_answers.filter((x) => x !== optIdx) : [...sq.correct_answers, optIdx] }
      }
    }))
  }

  function addSubOption(sqIdx: number) {
    setSubQuestions((prev) => prev.map((sq, i) =>
      i === sqIdx ? { ...sq, options: [...sq.options, ''] } : sq
    ))
  }

  function removeSubOption(sqIdx: number, optIdx: number) {
    setSubQuestions((prev) => prev.map((sq, i) => {
      if (i !== sqIdx) return sq
      return {
        ...sq,
        options: sq.options.filter((_, x) => x !== optIdx),
        correct_answers: sq.correct_answers
          .filter((x) => x !== optIdx)
          .map((x) => x > optIdx ? x - 1 : x),
      }
    }))
  }

  function addSubQuestion() { setSubQuestions((prev) => [...prev, emptySubQuestion()]) }
  function removeSubQuestion(sqIdx: number) {
    if (subQuestions.length <= 2) return
    setSubQuestions((prev) => prev.filter((_, i) => i !== sqIdx))
  }

  // ── Scoreboard helpers ───────────────────────────────────────────────────

  function addSbEvent() { setSbEvents((prev) => [...prev, emptyEvent()]) }
  function removeSbEvent(i: number) { setSbEvents((prev) => prev.filter((_, x) => x !== i)) }
  function updateSbEvent<K extends keyof ScoreboardEvent>(i: number, key: K, val: ScoreboardEvent[K]) {
    setSbEvents((prev) => prev.map((e, x) => x === i ? { ...e, [key]: val } : e))
  }

  function setSbEventPenaltyType(evtIdx: number, type: SinglePenalty['penalty_type'] | 'multiple') {
    setSbEvents((prev) => prev.map((e, i) => {
      if (i !== evtIdx) return e
      if (type === 'multiple') {
        const base = e.penalties.length > 0 ? e.penalties : [{ penalty_type: 'minor' as const, infraction: '' }]
        return { ...e, penalties: base.length < 2 ? [...base, { penalty_type: 'minor' as const, infraction: '' }] : base }
      }
      return { ...e, penalties: [{ penalty_type: type, infraction: e.penalties[0]?.infraction ?? '' }] }
    }))
  }

  function updateSbEventPenalty(evtIdx: number, penIdx: number, key: keyof SinglePenalty, val: string) {
    setSbEvents((prev) => prev.map((e, i) => {
      if (i !== evtIdx) return e
      const penalties = e.penalties.map((p, j) => j === penIdx ? { ...p, [key]: val } : p)
      return { ...e, penalties }
    }))
  }

  function addSbEventPenalty(evtIdx: number) {
    setSbEvents((prev) => prev.map((e, i) =>
      i === evtIdx ? { ...e, penalties: [...e.penalties, { penalty_type: 'minor' as const, infraction: '' }] } : e
    ))
  }

  function removeSbEventPenalty(evtIdx: number, penIdx: number) {
    setSbEvents((prev) => prev.map((e, i) => {
      if (i !== evtIdx || e.penalties.length <= 1) return e
      return { ...e, penalties: e.penalties.filter((_, j) => j !== penIdx) }
    }))
  }

  function addSbPlayerAnswer() { setSbPlayerAnswers((prev) => [...prev, emptyPlayerAnswer()]) }
  function removeSbPlayerAnswer(i: number) { setSbPlayerAnswers((prev) => prev.filter((_, x) => x !== i)) }
  function updateSbPlayerAnswer<K extends keyof ScoreboardPlayerAnswer>(i: number, key: K, val: ScoreboardPlayerAnswer[K]) {
    setSbPlayerAnswers((prev) => prev.map((a, x) => x === i ? { ...a, [key]: val } : a))
  }

  // ── Save logic ────────────────────────────────────────────────────────────

  async function doSave(): Promise<boolean> {
    setError('')

    if (!text.trim()) { setError('Situation / question text is required.'); return false }
    if (!category) { setError('Category is required.'); return false }
    if (!handbookSection) { setError('Handbook section is required.'); return false }

    const filledRefs = ruleRefs.filter((r) => r.trim())

    let payload: Record<string, unknown>

    if (mode === 'scoreboard') {
      if (sbEvents.length === 0) { setError('Add at least one event.'); return false }
      if (sbPlayerAnswers.length === 0) { setError('Add at least one correct answer row.'); return false }
      if (!rationale.trim()) { setError('Rationale is required.'); return false }

      for (let i = 0; i < sbEvents.length; i++) {
        const e = sbEvents[i]
        if (parseGT(e.gt) <= 0) { setError(`Event ${i + 1}: enter a valid game time (e.g. 3:18).`); return false }
        if (!gtSecondsValid(e.gt)) { setError(`Event ${i + 1}: seconds must be 0–59.`); return false }
        if (!e.team) { setError(`Event ${i + 1}: team is required.`); return false }
        if (e.type === 'penalty') {
          if (!e.player.trim()) { setError(`Event ${i + 1}: player number is required.`); return false }
          if (e.penalties.length === 0) { setError(`Event ${i + 1}: select a penalty type.`); return false }
        }
      }

      for (let i = 0; i < sbPlayerAnswers.length; i++) {
        const a = sbPlayerAnswers[i]
        if (!a.player.trim()) { setError(`Answer ${i + 1}: player number is required.`); return false }
        if (!a.already_expired && !a.wash_out && !parseGT(a.correct_gt)) { setError(`Answer ${i + 1}: enter a correct time or mark as Wash Out.`); return false }
        if (!a.already_expired && !a.wash_out && !gtSecondsValid(a.correct_gt)) { setError(`Answer ${i + 1}: seconds must be 0–59.`); return false }
      }

      payload = {
        text: text.trim(),
        answer_type: 'multiple_choice' as const,
        options: [],
        correct_answers: [],
        rationale: rationale.trim(),
        sub_questions: [{
          period: sbPeriod,
          start_gt: parseGT(sbStartGT) || 202,
          events: sbEvents.map((e) => ({ ...e, gt: parseGT(e.gt) })),
          player_answers: sbPlayerAnswers.map(({ correct_gt, ...rest }) => ({
            ...rest,
            correct_secs: parseGT(correct_gt),
          })),
        }],
        rule_number: filledRefs[0] ?? '',
        rule_references: filledRefs,
        handbook_section: handbookSection,
        situation_id: situationId.trim().toUpperCase(),
        league,
        category,
        question_type: 'scoreboard' as const,
        is_approved: isApproved,
      }

    } else if (mode === 'compound') {
      for (let i = 0; i < subQuestions.length; i++) {
        const sq = subQuestions[i]
        if (!sq.text.trim()) { setError(`Sub-question ${i + 1} is missing its question text.`); return false }
        const filled = sq.options.filter((o) => o.trim())
        if (filled.length < 2) { setError(`Sub-question ${i + 1} needs at least 2 answer options.`); return false }
        if (sq.correct_answers.length === 0) { setError(`Sub-question ${i + 1} has no correct answer selected.`); return false }
        if (!sq.rationale.trim()) { setError(`Sub-question ${i + 1} is missing a rationale.`); return false }
      }

      const cleanedSubQs: SubQuestion[] = subQuestions.map((sq) => ({
        text: sq.text.trim(),
        answer_type: sq.answer_type,
        options: sq.options.filter((o) => o.trim()),
        correct_answers: sq.correct_answers,
        rationale: sq.rationale.trim(),
      }))

      payload = {
        text: text.trim(),
        answer_type: 'multiple_choice' as const,
        options: [],
        correct_answers: [],
        rationale: '',
        sub_questions: cleanedSubQs,
        rule_number: filledRefs[0] ?? '',
        rule_references: filledRefs,
        handbook_section: handbookSection,
        situation_id: situationId.trim().toUpperCase(),
        league,
        category,
        question_type: 'compound' as const,
        is_approved: isApproved,
      }

    } else {
      if (correctAnswers.length === 0) { setError('Select at least one correct answer.'); return false }
      if (!rationale.trim()) { setError('Rationale is required.'); return false }
      const filledOptions = options.filter((o) => o.trim())
      if (filledOptions.length < 2) { setError('At least 2 answer options are required.'); return false }

      payload = {
        text: text.trim(),
        answer_type: mode as 'multiple_choice' | 'multi_select',
        options: filledOptions,
        correct_answers: correctAnswers,
        rationale: rationale.trim(),
        sub_questions: [],
        rule_number: filledRefs[0] ?? '',
        rule_references: filledRefs,
        handbook_section: handbookSection,
        situation_id: situationId.trim().toUpperCase(),
        league,
        category,
        question_type: 'situation' as const,
        is_approved: isApproved,
      }
    }

    setSaving(true)
    let err
    if (question?.id) {
      const { error } = await supabase.from('questions').update(payload).eq('id', question.id)
      err = error
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('questions').insert({ ...payload, created_by: user?.id })
      err = error
    }
    setSaving(false)

    if (err) { setError(err.message); return false }
    return true
  }

  async function handleSave() {
    if (await doSave()) { router.push(backUrl); router.refresh() }
  }

  async function handleSaveAndNext() {
    if (!nextId) return
    if (await doSave()) { router.push(`/admin/questions/${nextId}`); router.refresh() }
  }

  async function deleteQuestion() {
    if (!question?.id) return
    if (!confirm('Delete this question? This cannot be undone.')) return
    await supabase.from('questions').delete().eq('id', question.id)
    router.push('/admin/questions')
    router.refresh()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl space-y-6">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {/* Question type selector */}
      <div className="space-y-2">
        <Label>Question Type</Label>
        <div className="flex gap-3 flex-wrap">
          {([
            ['multiple_choice', 'Multiple Choice'],
            ['multi_select', 'Multi-Select'],
            ['compound', 'Compound (multi-part)'],
            ['scoreboard', 'Scoreboard (Penalty Clock)'],
          ] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                if (m === 'compound' && mode !== 'compound') {
                  const seeded: SubQuestionDraft = {
                    text: '',
                    answer_type: mode === 'multiple_choice' || mode === 'multi_select' ? mode : 'multiple_choice',
                    options: options.length ? [...options] : ['', '', '', ''],
                    correct_answers: [...correctAnswers],
                    rationale,
                  }
                  setSubQuestions([seeded, emptySubQuestion()])
                }
                setMode(m)
                setCorrectAnswers([])
              }}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                mode === m ? 'border-slate-900 bg-slate-900 text-white' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'compound' && (
          <p className="text-xs text-gray-500">
            The situation text is shown throughout. Each sub-question has its own options, correct answer, and rationale.
          </p>
        )}
        {mode === 'scoreboard' && (
          <p className="text-xs text-gray-500">
            An animated penalty clock plays out the situation. The user communicates each player's time to the timekeeper.
          </p>
        )}
      </div>

      {/* Situation / Question text */}
      <div className="space-y-2">
        <Label>Situation / Question</Label>
        <AutoResizeTextarea
          minHeight={96}
          value={text}
          onChange={setText}
          placeholder={
            mode === 'compound'
              ? 'Describe the on-ice situation that all sub-questions below will refer to…'
              : mode === 'scoreboard'
              ? 'Describe the situation — this appears above the penalty clock…'
              : 'Describe the on-ice situation or question…'
          }
        />
      </div>

      {/* ── Standard question ── */}
      {(mode === 'multiple_choice' || mode === 'multi_select') && (
        <>
          <div className="space-y-2">
            <Label>Answer Options <span className="text-gray-400 font-normal">(click the letter to mark correct)</span></Label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    onClick={() => toggleCorrect(i)}
                    className={`w-8 h-8 rounded-full border-2 text-sm font-bold shrink-0 transition-all ${
                      correctAnswers.includes(i)
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-gray-300 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    {String.fromCharCode(65 + i)}
                  </button>
                  <AutoResizeTextarea value={opt} onChange={(val) => updateOption(i, val)} placeholder={`Option ${String.fromCharCode(65 + i)}`} />
                  {options.length > 2 && (
                    <button onClick={() => removeOption(i)} className="text-gray-400 hover:text-red-500 text-lg shrink-0">×</button>
                  )}
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addOption}>+ Add Option</Button>
          </div>

          <div className="space-y-2">
            <Label>Rationale / Explanation</Label>
            <AutoResizeTextarea
              minHeight={80}
              value={rationale}
              onChange={setRationale}
              placeholder="Explain why the correct answer is correct, referencing the rule…"
            />
          </div>
        </>
      )}

      {/* ── Compound question ── */}
      {mode === 'compound' && (
        <div className="space-y-4">
          <Label>Sub-Questions</Label>
          {subQuestions.map((sq, sqIdx) => (
            <div key={sqIdx} className="border-2 border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">Part {sqIdx + 1}</span>
                <div className="flex items-center gap-2 ml-auto">
                  {(['multiple_choice', 'multi_select'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => updateSubField(sqIdx, 'answer_type', t)}
                      className={`px-3 py-1 rounded-md border text-xs font-medium transition-all ${
                        sq.answer_type === t
                          ? 'border-slate-700 bg-slate-700 text-white'
                          : 'border-gray-300 text-gray-500 hover:border-gray-400'
                      }`}
                    >
                      {t === 'multiple_choice' ? 'Multiple Choice' : 'Multi-Select'}
                    </button>
                  ))}
                </div>
                {subQuestions.length > 2 && (
                  <button onClick={() => removeSubQuestion(sqIdx)} className="text-xs text-red-500 hover:text-red-700 shrink-0">
                    Remove
                  </button>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Question</label>
                <AutoResizeTextarea
                  minHeight={64}
                  value={sq.text}
                  onChange={(val) => updateSubField(sqIdx, 'text', val)}
                  placeholder={`What is the question for Part ${sqIdx + 1}?`}
                  className="bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">
                  Answer Options <span className="font-normal">(click the letter to mark correct{sq.answer_type === 'multi_select' ? ' — multiple allowed' : ''})</span>
                </label>
                <div className="space-y-2">
                  {sq.options.map((opt, optIdx) => (
                    <div key={optIdx} className="flex items-center gap-2">
                      <button
                        onClick={() => toggleSubCorrect(sqIdx, optIdx)}
                        className={`w-8 h-8 rounded-full border-2 text-sm font-bold shrink-0 transition-all ${
                          sq.correct_answers.includes(optIdx)
                            ? 'border-green-500 bg-green-500 text-white'
                            : 'border-gray-300 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        {String.fromCharCode(65 + optIdx)}
                      </button>
                      <AutoResizeTextarea
                        value={opt}
                        onChange={(val) => updateSubOption(sqIdx, optIdx, val)}
                        placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                        className="bg-white"
                      />
                      {sq.options.length > 2 && (
                        <button onClick={() => removeSubOption(sqIdx, optIdx)} className="text-gray-400 hover:text-red-500 text-lg shrink-0">×</button>
                      )}
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={() => addSubOption(sqIdx)} className="mt-1">+ Add Option</Button>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Rationale</label>
                <AutoResizeTextarea
                  minHeight={64}
                  value={sq.rationale}
                  onChange={(val) => updateSubField(sqIdx, 'rationale', val)}
                  placeholder="Explain the correct answer for this part…"
                  className="bg-white"
                />
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={addSubQuestion}>+ Add Part</Button>
        </div>
      )}

      {/* ── Scoreboard question ── */}
      {mode === 'scoreboard' && (
        <div className="space-y-5">

          {/* Game setup */}
          <div className="space-y-2">
            <Label>Game Setup</Label>
            <div className="flex gap-4 items-end flex-wrap">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Period</label>
                <div className="flex gap-1">
                  {([1, 2, 3, 4] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setSbPeriod(p)}
                      className={`w-10 h-9 rounded-md border text-sm font-medium transition-all ${
                        sbPeriod === p ? 'border-slate-900 bg-slate-900 text-white' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {p === 4 ? 'OT' : p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Starting game time (m:ss)</label>
                <Input
                  value={sbStartGT}
                  onChange={(e) => setSbStartGT(maskGameTime(e.target.value))}
                  placeholder="mm:ss"
                  className={`w-24 font-mono ${!gtSecondsValid(sbStartGT) ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                />
                {!gtSecondsValid(sbStartGT) && (
                  <p className="text-red-500 text-xs">Seconds must be 0–59</p>
                )}
              </div>
            </div>
          </div>

          {/* Events */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Events <span className="text-gray-400 font-normal text-xs ml-1">— add in chronological order, highest game time first</span></Label>
            </div>

            {sbEvents.length === 0 && (
              <p className="text-sm text-gray-400 py-2">No events yet. Add the penalties and goal that make up the situation.</p>
            )}

            <div className="space-y-3">
              {sbEvents.map((evt, i) => {
                const isMultiple = evt.penalties.length > 1
                const activeType = isMultiple ? 'multiple' : (evt.penalties[0]?.penalty_type ?? 'minor')

                return (
                  <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
                    {/* Top row: game time, event type, team, player, remove */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="space-y-0.5">
                        <label className="text-xs text-gray-400">Game time</label>
                        <Input
                          value={evt.gt}
                          onChange={(e) => updateSbEvent(i, 'gt', maskGameTime(e.target.value))}
                          placeholder="mm:ss"
                          className={`w-20 font-mono text-sm ${!gtSecondsValid(evt.gt) ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                        />
                        {!gtSecondsValid(evt.gt) && (
                          <p className="text-red-500 text-xs">Seconds must be 0–59</p>
                        )}
                      </div>

                      <div className="space-y-0.5">
                        <label className="text-xs text-gray-400">Type</label>
                        <div className="flex gap-1">
                          {(['penalty', 'goal'] as const).map((t) => (
                            <button
                              key={t}
                              onClick={() => updateSbEvent(i, 'type', t)}
                              className={`px-3 h-9 rounded-md border text-xs font-medium capitalize transition-all ${
                                evt.type === t ? 'border-slate-700 bg-slate-700 text-white' : 'border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <label className="text-xs text-gray-400">Team</label>
                        <div className="flex gap-1">
                          {(['A', 'B'] as const).map((t) => (
                            <button
                              key={t}
                              onClick={() => updateSbEvent(i, 'team', t)}
                              className={`w-9 h-9 rounded-md border text-sm font-medium transition-all ${
                                evt.team === t ? 'border-slate-700 bg-slate-700 text-white' : 'border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      {evt.type === 'penalty' && (
                        <div className="space-y-0.5">
                          <label className="text-xs text-gray-400">Player #</label>
                          <Input
                            value={evt.player}
                            onChange={(e) => updateSbEvent(i, 'player', e.target.value)}
                            placeholder="e.g. 43"
                            className="w-20 text-sm"
                          />
                        </div>
                      )}

                      <button
                        onClick={() => removeSbEvent(i)}
                        className="text-gray-300 hover:text-red-500 text-xl ml-auto self-end pb-1"
                      >
                        ×
                      </button>
                    </div>

                    {/* Penalty type selector + penalties list */}
                    {evt.type === 'penalty' && (
                      <div className="space-y-2">
                        <div className="space-y-0.5">
                          <label className="text-xs text-gray-400">Penalty type</label>
                          <div className="flex gap-1 flex-wrap">
                            {([
                              ['minor', 'Minor'],
                              ['double_minor', 'Double Minor'],
                              ['major', 'Major'],
                              ['match', 'Match'],
                              ['multiple', 'Multiple'],
                            ] as const).map(([type, label]) => (
                              <button
                                key={type}
                                onClick={() => setSbEventPenaltyType(i, type)}
                                className={`px-3 h-8 rounded-md border text-xs font-medium transition-all ${
                                  activeType === type
                                    ? 'border-slate-700 bg-slate-700 text-white'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Single penalty: infraction field inline */}
                        {!isMultiple && (
                          <div className="space-y-0.5">
                            <label className="text-xs text-gray-400">For (optional — e.g. Cross-checking)</label>
                            <Input
                              value={evt.penalties[0]?.infraction ?? ''}
                              onChange={(e) => updateSbEventPenalty(i, 0, 'infraction', e.target.value)}
                              placeholder="e.g. High-Sticking, Holding…"
                              className="text-sm"
                            />
                          </div>
                        )}

                        {/* Multiple penalties: list with type + infraction per entry */}
                        {isMultiple && (
                          <div className="space-y-2 pl-2 border-l-2 border-gray-200">
                            {evt.penalties.map((pen, penIdx) => (
                              <div key={penIdx} className="flex items-end gap-2 flex-wrap">
                                <div className="space-y-0.5">
                                  <label className="text-xs text-gray-400">Type</label>
                                  <select
                                    value={pen.penalty_type}
                                    onChange={(e) => updateSbEventPenalty(i, penIdx, 'penalty_type', e.target.value)}
                                    className="h-9 border rounded-md px-2 text-xs"
                                  >
                                    {Object.entries(PENALTY_DISPLAY).map(([val, lbl]) => (
                                      <option key={val} value={val}>{lbl}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex-1 space-y-0.5 min-w-32">
                                  <label className="text-xs text-gray-400">For (optional)</label>
                                  <Input
                                    value={pen.infraction}
                                    onChange={(e) => updateSbEventPenalty(i, penIdx, 'infraction', e.target.value)}
                                    placeholder="e.g. Fighting, Roughing…"
                                    className="text-sm"
                                  />
                                </div>
                                {evt.penalties.length > 1 && (
                                  <button
                                    onClick={() => removeSbEventPenalty(i, penIdx)}
                                    className="text-gray-300 hover:text-red-500 text-lg pb-0.5"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              onClick={() => addSbEventPenalty(i)}
                              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                            >
                              + Add penalty
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <Button variant="outline" size="sm" onClick={addSbEvent}>+ Add Event</Button>
          </div>

          {/* Correct answers */}
          <div className="space-y-2">
            <Label>
              Correct Answers <span className="text-gray-400 font-normal text-xs ml-1">— what the clock shows after the key event</span>
            </Label>
            <p className="text-xs text-gray-500">
              Auto-populated from penalty events above. For each player, enter the time remaining, mark as <strong>Wash Out</strong> if their penalty is released by the goal, or mark as <strong>Already Expired</strong> if the penalty finished before the key event (these won&apos;t be shown as answer options).
            </p>

            {sbPlayerAnswers.length === 0 && (
              <p className="text-sm text-gray-400 py-1">Add penalty events above to populate this section.</p>
            )}

            <div className="space-y-2">
              {sbPlayerAnswers.map((ans, i) => (
                <div
                  key={i}
                  className={`border rounded-xl px-3 py-2.5 flex items-center gap-3 flex-wrap transition-colors ${
                    ans.already_expired ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-200'
                  }`}
                >
                  {/* Read-only team + player */}
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 shrink-0">
                    <span className="w-7 h-7 rounded-md bg-slate-700 text-white text-xs font-semibold flex items-center justify-center">{ans.team}</span>
                    <span>#{ans.player || '—'}</span>
                  </span>

                  {/* Time input — hidden when already_expired */}
                  {!ans.already_expired && (
                    <div className="space-y-0.5">
                      <label className="text-xs text-gray-400">Time remaining</label>
                      <Input
                        value={ans.wash_out ? '' : ans.correct_gt}
                        onChange={(e) => updateSbPlayerAnswer(i, 'correct_gt', maskGameTime(e.target.value))}
                        placeholder="e.g. 1:34"
                        disabled={ans.wash_out}
                        className={`w-24 font-mono text-sm disabled:opacity-40 ${!ans.wash_out && !gtSecondsValid(ans.correct_gt) ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      />
                      {!ans.wash_out && !gtSecondsValid(ans.correct_gt) && (
                        <p className="text-red-500 text-xs">Seconds must be 0–59</p>
                      )}
                    </div>
                  )}

                  {/* Wash Out toggle — hidden when already_expired */}
                  {!ans.already_expired && (
                    <button
                      onClick={() => {
                        const next = !ans.wash_out
                        updateSbPlayerAnswer(i, 'wash_out', next)
                        if (next) updateSbPlayerAnswer(i, 'correct_secs', 0)
                      }}
                      className={`h-8 px-3 rounded-md border text-xs font-medium transition-all ${
                        ans.wash_out
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      Wash Out
                    </button>
                  )}

                  {/* Already Expired toggle */}
                  <button
                    onClick={() => {
                      const next = !ans.already_expired
                      updateSbPlayerAnswer(i, 'already_expired', next)
                      if (next) {
                        updateSbPlayerAnswer(i, 'wash_out', false)
                        updateSbPlayerAnswer(i, 'correct_secs', 0)
                      }
                    }}
                    className={`h-8 px-3 rounded-md border text-xs font-medium transition-all ${
                      ans.already_expired
                        ? 'border-gray-500 bg-gray-100 text-gray-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    Already Expired
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Rationale */}
          <div className="space-y-2">
            <Label>Rationale / Explanation</Label>
            <AutoResizeTextarea
              minHeight={80}
              value={rationale}
              onChange={setRationale}
              placeholder="Explain the correct clock times after the event, referencing the rule…"
            />
          </div>

          {/* Preview button */}
          <div className="pt-1">
            <Button
              variant="outline"
              onClick={() => setSbPreviewOpen(true)}
              disabled={sbEvents.length === 0 || !parseGT(sbStartGT)}
            >
              👁 Preview Simulation
            </Button>
            <p className="text-xs text-gray-400 mt-1.5">
              Run the simulation as a student would see it — no save required.
            </p>
          </div>

          {/* Preview dialog */}
          <Dialog open={sbPreviewOpen} onOpenChange={setSbPreviewOpen}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Simulation Preview</DialogTitle>
              </DialogHeader>
              {sbPreviewOpen && (
                <ScoreboardPreview
                  period={sbPeriod}
                  startGT={parseGT(sbStartGT)}
                  events={sbEvents.map((e) => ({ ...e, gt: parseGT(e.gt) }))}
                  playerAnswers={sbPlayerAnswers.map((a) => ({
                    ...a,
                    correct_secs: parseGT(a.correct_gt),
                  }))}
                  rationale={rationale}
                  ruleNumber={ruleRefs[0] ?? ''}
                />
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ── Shared metadata ── */}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Handbook Section</Label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={handbookSection}
            onChange={(e) => setHandbookSection(e.target.value)}
          >
            <option value="">Select a section…</option>
            {HANDBOOK_SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Situation ID <span className="text-gray-400 font-normal">(e.g. 16B)</span></Label>
          <Input
            value={situationId}
            onChange={(e) => setSituationId(e.target.value)}
            placeholder="e.g. 16B"
            className="uppercase"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Rule References <span className="text-gray-400 font-normal">— first entry is the primary rule</span></Label>
        <p className="text-xs text-gray-500">
          Format: <code className="bg-gray-100 px-1 rounded">15.2</code> or <code className="bg-gray-100 px-1 rounded">15.1 P.2</code> or <code className="bg-gray-100 px-1 rounded">1.10(iv)</code> or <code className="bg-gray-100 px-1 rounded">tbl.14(Ex.G12)</code> or <code className="bg-gray-100 px-1 rounded">tbl.14</code>
        </p>
        <div className="space-y-2">
          {ruleRefs.map((ref, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-5 shrink-0">{i === 0 ? '★' : '+'}</span>
              <Input
                value={ref}
                onChange={(e) => updateRuleRef(i, e.target.value)}
                placeholder={i === 0 ? 'Primary rule (e.g. 16.2)' : 'Additional rule or table (e.g. tbl.12(Ex.H10))'}
              />
              {ruleRefs.length > 1 && (
                <button onClick={() => removeRuleRef(i)} className="text-gray-400 hover:text-red-500 text-lg shrink-0">×</button>
              )}
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={addRuleRef}>+ Add Rule Reference</Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Category</Label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Select a category…</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>League</Label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={league}
            onChange={(e) => setLeague(e.target.value as 'NHL' | 'AHL' | 'both')}
          >
            <option value="both">Both (NHL & AHL)</option>
            <option value="NHL">NHL only</option>
            <option value="AHL">AHL only</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
        <input
          id="approved"
          type="checkbox"
          checked={isApproved}
          onChange={(e) => setIsApproved(e.target.checked)}
          className="h-4 w-4"
        />
        <div>
          <Label htmlFor="approved" className="cursor-pointer">Mark as approved</Label>
          <p className="text-xs text-gray-500 mt-0.5">Approved questions are visible to users in quizzes.</p>
        </div>
      </div>

      {nextPosition && (
        <p className="text-xs text-gray-400">Question {nextPosition.current} of {nextPosition.total} in current view</p>
      )}

      <div className="flex gap-3 flex-wrap">
        <Button onClick={handleSave} disabled={saving} className="flex-1 min-w-32">
          {saving ? 'Saving…' : question?.id ? 'Save Changes' : 'Create Question'}
        </Button>
        {question?.id && nextId && (
          <Button onClick={handleSaveAndNext} disabled={saving} variant="outline" className="flex-1 min-w-40">
            {saving ? 'Saving…' : 'Save & Next →'}
          </Button>
        )}
        <Button variant="outline" onClick={() => router.push(backUrl)}>Cancel</Button>
        {question?.id && (
          <Button variant="destructive" onClick={deleteQuestion}>Delete</Button>
        )}
      </div>
    </div>
  )
}
