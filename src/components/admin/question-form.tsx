'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { Question, SubQuestion } from '@/types'

function AutoResizeTextarea({ value, onChange, placeholder, className }: {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [])
  useEffect(() => { resize() }, [value, resize])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => { onChange(e.target.value); resize() }}
      placeholder={placeholder}
      className={`w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none overflow-hidden leading-5 ${className ?? ''}`}
    />
  )
}

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

  // Navigation context — read from sessionStorage set by the questions list page
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
      // sessionStorage unavailable or malformed — graceful degradation
    }
  }, [question?.id])

  // Derive initial mode from existing question data
  function initialMode(): 'multiple_choice' | 'multi_select' | 'compound' {
    if (question?.question_type === 'compound') return 'compound'
    if (question?.answer_type === 'multi_select') return 'multi_select'
    return 'multiple_choice'
  }

  // Single combined mode replaces separate answerType + questionType
  const [mode, setMode] = useState<'multiple_choice' | 'multi_select' | 'compound'>(initialMode)

  // Shared metadata fields
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

  // Standard question fields (used when mode !== 'compound')
  const [options, setOptions] = useState<string[]>(question?.options?.length ? question.options : ['', '', '', ''])
  const [correctAnswers, setCorrectAnswers] = useState<number[]>(question?.correct_answers ?? [])
  const [rationale, setRationale] = useState(question?.rationale ?? '')

  // Compound sub-questions
  const [subQuestions, setSubQuestions] = useState<SubQuestionDraft[]>(
    question?.question_type === 'compound' && question?.sub_questions?.length
      ? question.sub_questions.map(toSubDraft)
      : [emptySubQuestion(), emptySubQuestion()]
  )

  // ─── Standard question helpers ─────────────────────────────────────────────

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

  // ─── Rule reference helpers ────────────────────────────────────────────────

  function updateRuleRef(i: number, val: string) {
    const u = [...ruleRefs]; u[i] = val; setRuleRefs(u)
  }
  function addRuleRef() { setRuleRefs([...ruleRefs, '']) }
  function removeRuleRef(i: number) {
    if (ruleRefs.length === 1) return
    setRuleRefs(ruleRefs.filter((_, x) => x !== i))
  }

  // ─── Compound sub-question helpers ────────────────────────────────────────

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

  function addSubQuestion() {
    setSubQuestions((prev) => [...prev, emptySubQuestion()])
  }

  function removeSubQuestion(sqIdx: number) {
    if (subQuestions.length <= 2) return
    setSubQuestions((prev) => prev.filter((_, i) => i !== sqIdx))
  }

  // ─── Save logic ───────────────────────────────────────────────────────────

  async function doSave(): Promise<boolean> {
    setError('')

    if (!text.trim()) { setError('Situation / question text is required.'); return false }
    if (!category) { setError('Category is required.'); return false }
    if (!handbookSection) { setError('Handbook section is required.'); return false }

    const filledRefs = ruleRefs.filter((r) => r.trim())

    let payload: Record<string, unknown>

    if (mode === 'compound') {
      // Validate sub-questions
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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl space-y-6">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {/* Combined question mode selector */}
      <div className="space-y-2">
        <Label>Question Type</Label>
        <div className="flex gap-3 flex-wrap">
          {([
            ['multiple_choice', 'Multiple Choice (one answer)'],
            ['multi_select', 'Multi-Select (all that apply)'],
            ['compound', 'Compound (multi-part)'],
          ] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                if (m === 'compound' && mode !== 'compound') {
                  // Carry current options/answers into the first sub-question
                  const seeded: SubQuestionDraft = {
                    text: '',
                    answer_type: mode,
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
            The situation text is shown to the user throughout the question. Each sub-question has its own options, correct answer, and rationale.
          </p>
        )}
      </div>

      {/* Situation / Question text */}
      <div className="space-y-2">
        <Label>Situation / Question</Label>
        <textarea
          className="w-full border rounded-md px-3 py-2 text-sm min-h-24 resize-y focus:outline-none focus:ring-2 focus:ring-slate-900"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            mode === 'compound'
              ? 'Describe the on-ice situation that all sub-questions below will refer to…'
              : 'Describe the on-ice situation or question…'
          }
        />
      </div>

      {/* ── Standard question: options + rationale ── */}
      {mode !== 'compound' && (
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
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm min-h-20 resize-y focus:outline-none focus:ring-2 focus:ring-slate-900"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Explain why the correct answer is correct, referencing the rule…"
            />
          </div>
        </>
      )}

      {/* ── Compound question: sub-question builder ── */}
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
                  <button
                    onClick={() => removeSubQuestion(sqIdx)}
                    className="text-xs text-red-500 hover:text-red-700 shrink-0"
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Sub-question text */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Question</label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-16 resize-y focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                  value={sq.text}
                  onChange={(e) => updateSubField(sqIdx, 'text', e.target.value)}
                  placeholder={`What is the question for Part ${sqIdx + 1}?`}
                />
              </div>

              {/* Options */}
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

              {/* Rationale */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Rationale</label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-16 resize-y focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                  value={sq.rationale}
                  onChange={(e) => updateSubField(sqIdx, 'rationale', e.target.value)}
                  placeholder="Explain the correct answer for this part…"
                />
              </div>
            </div>
          ))}

          <Button variant="outline" onClick={addSubQuestion}>+ Add Part</Button>
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
          <Label>Situation ID <span className="text-gray-400 font-normal">(e.g. 8A)</span></Label>
          <Input
            value={situationId}
            onChange={(e) => setSituationId(e.target.value)}
            placeholder="e.g. 8A"
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
                placeholder={i === 0 ? 'Primary rule (e.g. 15.2)' : 'Additional rule or table (e.g. tbl.14 or tbl.14(Ex.G12))'}
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
