'use client'

import { useState, useEffect, useRef, useCallback, forwardRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScoreboardPreview } from '@/components/admin/scoreboard-preview'
import { PenaltyTableChipEditor } from '@/components/admin/penalty-table-chip-editor'
import { MatchPromptDialog, type MatchGroup } from '@/components/admin/match-prompt-dialog'
import { AutoUpdatePreviewDialog } from '@/components/admin/auto-update-preview-dialog'
import { HANDBOOK_SECTIONS, CATEGORIES } from '@/lib/constants'
import { PENALTY_DISPLAY, parseGameTime, formatGT, gtSecondsValid, maskGameTime } from '@/lib/scoreboard'
import { PENALTY_TABLE_MARKER, hasPenaltyTableMarker } from '@/lib/penaltyTable'
import { getMatchesForSituation, getQuestionsBySituationIds, otherSituationId } from '@/lib/situationMatches'
import type { SinglePenalty } from '@/types/scoreboard'
import type { League, Question, SubQuestion } from '@/types'

const MATCH_REVIEW_QUEUE_KEY = 'match_review_queue'
const SUBSTANTIVE_FIELDS = ['text', 'options', 'correct_answers', 'rationale', 'sub_questions', 'rule_references'] as const

const AutoResizeTextarea = forwardRef<HTMLTextAreaElement, {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  className?: string
  minHeight?: number
}>(function AutoResizeTextarea({ value, onChange, placeholder, className, minHeight }, forwardedRef) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const lastWidthRef = useRef(0)
  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(el.scrollHeight, minHeight ?? 0) + 'px'
  }, [minHeight])
  useEffect(() => { resize() }, [value, resize])
  // Wrapped line count — and so scrollHeight — depends on the textarea's rendered
  // width, not just its value. On mount that width can still be settling (e.g. the
  // page's own layout hasn't stabilized yet), so the effect above can measure at a
  // transient, too-narrow width and lock in an inflated height that never gets
  // recomputed since nothing else re-runs it. A ResizeObserver re-fires whenever the
  // box's actual rendered width changes, so it catches the real width once layout
  // settles. Compare against the previous width (not just "any resize") because
  // resize() itself changes the element's height, which would otherwise re-trigger
  // this observer in a loop.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width === undefined || Math.abs(width - lastWidthRef.current) < 0.5) return
      lastWidthRef.current = width
      resize()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [resize])
  return (
    <textarea
      ref={(el) => {
        ref.current = el
        if (typeof forwardedRef === 'function') forwardedRef(el)
        else if (forwardedRef) forwardedRef.current = el
      }}
      rows={1}
      value={value}
      onChange={(e) => { onChange(e.target.value); resize() }}
      placeholder={placeholder}
      style={{ minHeight: minHeight ? `${minHeight}px` : undefined }}
      className={`w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none overflow-hidden leading-5 ${className ?? ''}`}
    />
  )
})

// ── Scoreboard draft types ──────────────────────────────────────────────────
// The *editing* shapes below keep game times as raw strings while the admin
// types them; they're parsed to seconds on save. The stored / validated shapes
// (with gt in seconds) live in @/types/scoreboard.

interface ScoreboardEvent {
  gt: string  // raw user input, e.g. "3:18" — parsed to seconds only on save
  type: 'penalty' | 'goal' | 'other'
  team: 'A' | 'B'
  player: string
  penalties: SinglePenalty[]  // one entry for single; multiple for combined (e.g. minor + major)
  title: string       // 'other' events only — replaces the "Penalty"/"Goal" overlay label
  descriptor: string  // 'other' events only — the overlay's sub-text
}

type ScoreboardSituationType = 'coincidental' | 'expiration'

interface ScoreboardPlayerAnswer {
  team: 'A' | 'B'
  player: string
  correct_gt: string   // raw typed string, e.g. "1:34"; parsed to correct_secs on save
  correct_secs: number // derived on save from correct_gt
  wash_out: boolean
  already_expired: boolean    // penalty expired before the key event; not shown as answer option
}

// Keeps the form's "0 on invalid" convention on top of the shared parser.
function parseGT(s: string): number {
  return parseGameTime(s) ?? 0
}

function emptyEvent(): ScoreboardEvent {
  return { gt: '', type: 'penalty', team: 'A', player: '', penalties: [{ penalty_type: 'minor', infraction: '' }], title: '', descriptor: '' }
}

function emptyPlayerAnswer(): ScoreboardPlayerAnswer {
  return { team: 'A', player: '', correct_gt: '', correct_secs: 0, wash_out: false, already_expired: false }
}

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
  // Show only the options actually saved — no padding to a fixed count, so
  // reopening a 2- or 3-option sub-question doesn't display empty slots.
  return { text: sq.text, answer_type: sq.answer_type ?? 'multiple_choice', options: [...sq.options], correct_answers: sq.correct_answers, rationale: sq.rationale }
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
      // The match-review queue (set when the admin picks "Review manually"
      // from the known-matches prompt) takes priority over the ordinary
      // list-browsing queue, so a detour into reviewing matches never
      // disturbs whatever queue the admin was already browsing.
      const matchRaw = sessionStorage.getItem(MATCH_REVIEW_QUEUE_KEY)
      if (matchRaw) {
        const { ids, backUrl: url } = JSON.parse(matchRaw) as { ids: string[]; backUrl: string }
        const idx = ids.indexOf(question.id)
        if (idx !== -1) {
          if (url) setBackUrl(url)
          setNextPosition({ current: idx + 1, total: ids.length })
          if (idx < ids.length - 1) setNextId(ids[idx + 1])
          return
        }
      }

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

  /** Appends the penalty table marker to the end of the current text (default: below existing text). */
  function appendPenaltyTableMarker() {
    setText((prev) => {
      const withoutMarker = prev.split(PENALTY_TABLE_MARKER).join('').trimEnd()
      return withoutMarker ? `${withoutMarker} ${PENALTY_TABLE_MARKER}` : PENALTY_TABLE_MARKER
    })
  }

  function removePenaltyTableMarker() {
    setText((prev) => prev.split(PENALTY_TABLE_MARKER).join(''))
  }
  const [ruleRefs, setRuleRefs] = useState<string[]>(
    question?.rule_references?.length ? question.rule_references : (question?.rule_number ? [question.rule_number] : [''])
  )
  const [handbookSection, setHandbookSection] = useState(question?.handbook_section ?? '')
  const [situationId, setSituationId] = useState(question?.situation_id ?? '')
  const [league, setLeague] = useState<League[]>(question?.league ?? ['NHL', 'AHL'])
  function toggleLeague(l: League) {
    setLeague((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]))
  }
  const [category, setCategory] = useState(question?.category ?? '')
  const [isApproved, setIsApproved] = useState(question?.is_approved ?? false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Standard question fields
  const [options, setOptions] = useState<string[]>(question?.options?.length ? question.options : ['', '', '', ''])
  const [correctAnswers, setCorrectAnswers] = useState<number[]>(question?.correct_answers ?? [])
  const [rationale, setRationale] = useState(question?.rationale ?? '')

  // Penalty table (optional, for MC/multi-select)
  type PenaltyEntry = { player: string; penalties: string; time?: string }
  const existingTable = question?.penalty_table as { teamA?: PenaltyEntry[]; teamB?: PenaltyEntry[] } | undefined
  const [penaltyA, setPenaltyA] = useState<PenaltyEntry[]>(existingTable?.teamA ?? [])
  const [penaltyB, setPenaltyB] = useState<PenaltyEntry[]>(existingTable?.teamB ?? [])
  const hasPenaltyTable = penaltyA.length > 0 || penaltyB.length > 0
  function emptyEntry(): PenaltyEntry { return { player: '', penalties: '', time: '' } }
  function updateEntry(team: 'A' | 'B', i: number, field: keyof PenaltyEntry, value: string) {
    const set = team === 'A' ? setPenaltyA : setPenaltyB
    set((prev) => { const n = [...prev]; n[i] = { ...n[i], [field]: value }; return n })
  }
  function removeEntry(team: 'A' | 'B', i: number) {
    const set = team === 'A' ? setPenaltyA : setPenaltyB
    set((prev) => prev.filter((_, j) => j !== i))
  }

  // Compound sub-questions
  const [subQuestions, setSubQuestions] = useState<SubQuestionDraft[]>(
    question?.question_type === 'compound' && question?.sub_questions?.length
      ? question.sub_questions.map(toSubDraft)
      : [emptySubQuestion(), emptySubQuestion()]
  )

  // Scoreboard fields
  const sbConfig = question?.question_type === 'scoreboard' ? (question.sub_questions?.[0] as any) : null
  const [sbPreviewOpen, setSbPreviewOpen] = useState(false)
  const [sbSituationType, setSbSituationType] = useState<ScoreboardSituationType>(sbConfig?.situation_type ?? 'expiration')
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

  // ── Unsaved-changes guard ────────────────────────────────────────────────
  // Snapshots raw form state (not the cleaned save payload) so a change is
  // caught the moment it happens, regardless of question type. The initial
  // snapshot is captured via useState's lazy initializer, which only ever
  // runs on the very first render — exactly what each field's own useState
  // initializer produced, with nothing to keep in sync by hand.
  function formSnapshot() {
    return JSON.stringify({
      mode, text, ruleRefs, handbookSection, situationId, league, category, isApproved,
      options, correctAnswers, rationale, penaltyA, penaltyB, subQuestions,
      sbSituationType, sbPeriod, sbStartGT, sbEvents, sbPlayerAnswers,
    })
  }
  const [initialSnapshot] = useState(() => formSnapshot())
  const isDirty = initialSnapshot !== formSnapshot()

  // Refs so the popstate/beforeunload listeners (attached once) always read
  // the latest values without needing to resubscribe on every change.
  const isDirtyRef = useRef(isDirty)
  const backUrlRef = useRef(backUrl)
  useEffect(() => {
    isDirtyRef.current = isDirty
    backUrlRef.current = backUrl
  }, [isDirty, backUrl])

  const UNSAVED_CHANGES_MESSAGE = 'You have unsaved changes to this question. Leave without saving?'

  function confirmLeave(): boolean {
    return !isDirty || window.confirm(UNSAVED_CHANGES_MESSAGE)
  }

  // Tab close / refresh / typing a new URL — browser's own generic prompt.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Browser back/forward button. Pressing back normally leaves the page before
  // React ever gets a say, so a sentinel history entry is pushed once the form
  // goes dirty — that entry absorbs the first back press as a popstate event
  // we can intercept and confirm, instead of a real navigation.
  const sentinelPushedRef = useRef(false)
  useEffect(() => {
    if (isDirty && !sentinelPushedRef.current) {
      sentinelPushedRef.current = true
      window.history.pushState(null, '', window.location.href)
    }
  }, [isDirty])

  useEffect(() => {
    function handlePopState() {
      if (!isDirtyRef.current) return
      if (window.confirm(UNSAVED_CHANGES_MESSAGE)) {
        // A hard navigation, not router.push — Next's own popstate handling
        // fires on this same event and reliably wins a race against a
        // client-side push issued from inside a popstate handler.
        window.location.href = backUrlRef.current
      } else {
        window.history.pushState(null, '', window.location.href)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [router])

  function handleCancel() {
    if (confirmLeave()) router.push(backUrl)
  }

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

  // ── Known-matches prompt ─────────────────────────────────────────────────

  interface MatchPromptState {
    sourceQuestionId: string
    payload: Record<string, unknown>
    groups: MatchGroup[]
    canAutoUpdate: boolean
    navigate: () => void
  }

  interface AutoUpdateState {
    targetQuestions: Question[]
    payload: Record<string, unknown>
    navigate: () => void
  }

  const [matchPrompt, setMatchPrompt] = useState<MatchPromptState | null>(null)
  const [autoUpdateState, setAutoUpdateState] = useState<AutoUpdateState | null>(null)

  /**
   * After a successful save on an existing question, checks whether any
   * known matches should be surfaced before navigating away. Creation is
   * exempt (a brand-new question has no matches yet by definition), and the
   * prompt only fires on a substantive change — comparing the freshly-built
   * payload against the original `question` prop, the only true "before"
   * snapshot available.
   */
  async function maybeShowMatchPrompt(payload: Record<string, unknown>, navigate: () => void) {
    if (!question?.id) { navigate(); return }

    const substantiveChanged = SUBSTANTIVE_FIELDS.some(
      (field) => JSON.stringify(payload[field]) !== JSON.stringify((question as unknown as Record<string, unknown>)[field])
    )
    if (!substantiveChanged) { navigate(); return }

    // Post-save situation_id — if it changed in this same save, check
    // matches against where the row now lives, not where it used to be.
    const sid = (payload.situation_id as string) || question.situation_id
    if (!sid) { navigate(); return }

    const matches = await getMatchesForSituation(supabase, sid)
    if (matches.length === 0) { navigate(); return }

    const otherSituationIds = [...new Set(matches.map((m) => otherSituationId(m, sid)))]
    const matchedQuestions = await getQuestionsBySituationIds(supabase, otherSituationIds)

    const groups: MatchGroup[] = matches
      .map((m) => {
        const otherSid = otherSituationId(m, sid)
        return {
          situationId: otherSid,
          matchType: m.match_type,
          questions: matchedQuestions.filter((q) => q.situation_id === otherSid),
        }
      })
      .filter((g) => g.questions.length > 0)

    if (groups.length === 0) { navigate(); return }

    // Auto-update is only offered when every exact-match target shares both
    // question_type and answer_type with the source — a mismatch (e.g. one
    // multiple_choice, one multi_select under the same question_type) would
    // otherwise silently copy a multi-answer correct_answers array onto a
    // single-select row.
    const exactQuestions = groups.filter((g) => g.matchType === 'exact_match').flatMap((g) => g.questions)
    const canAutoUpdate =
      exactQuestions.length > 0 &&
      exactQuestions.every((q) => q.question_type === payload.question_type && q.answer_type === payload.answer_type)

    setMatchPrompt({ sourceQuestionId: question.id, payload, groups, canAutoUpdate, navigate })
  }

  function handleReviewManually(questionIds: string[]) {
    if (!matchPrompt) return
    try {
      sessionStorage.setItem(
        MATCH_REVIEW_QUEUE_KEY,
        JSON.stringify({ ids: questionIds, backUrl: `/admin/questions/${matchPrompt.sourceQuestionId}` })
      )
    } catch {
      // sessionStorage unavailable — navigation to the first match still works,
      // it just won't chain through the rest via Save & Next.
    }
    setMatchPrompt(null)
    router.push(`/admin/questions/${questionIds[0]}`)
  }

  function handleAutoUpdate() {
    if (!matchPrompt) return
    const targetQuestions = matchPrompt.groups
      .filter((g) => g.matchType === 'exact_match')
      .flatMap((g) => g.questions)
    setAutoUpdateState({ targetQuestions, payload: matchPrompt.payload, navigate: matchPrompt.navigate })
    setMatchPrompt(null)
  }

  async function confirmAutoUpdate(targetIds: string[], autoUpdatePayload: Record<string, unknown>) {
    const { error } = await supabase.from('questions').update(autoUpdatePayload).in('id', targetIds)
    if (error) throw new Error(error.message)
    const navigate = autoUpdateState?.navigate
    setAutoUpdateState(null)
    navigate?.()
  }

  // ── Save logic ────────────────────────────────────────────────────────────

  async function doSave(): Promise<{ success: boolean; payload?: Record<string, unknown> }> {
    setError('')

    if (!text.trim()) { setError('Situation / question text is required.'); return { success: false } }
    if (!category) { setError('Category is required.'); return { success: false } }
    if (!handbookSection) { setError('Handbook section is required.'); return { success: false } }
    if (league.length === 0) { setError('Select at least one league.'); return { success: false } }

    const filledRefs = ruleRefs.filter((r) => r.trim())

    let payload: Record<string, unknown>

    if (mode === 'scoreboard') {
      if (sbEvents.length === 0) { setError('Add at least one event.'); return { success: false } }
      if (sbPlayerAnswers.length === 0) { setError('Add at least one correct answer row.'); return { success: false } }
      if (!rationale.trim()) { setError('Rationale is required.'); return { success: false } }

      for (let i = 0; i < sbEvents.length; i++) {
        const e = sbEvents[i]
        if (parseGT(e.gt) <= 0) { setError(`Event ${i + 1}: enter a valid game time (e.g. 3:18).`); return { success: false } }
        if (!gtSecondsValid(e.gt)) { setError(`Event ${i + 1}: seconds must be 0–59.`); return { success: false } }
        if (e.type !== 'other' && !e.team) { setError(`Event ${i + 1}: team is required.`); return { success: false } }
        if (e.type === 'penalty') {
          if (!e.player.trim()) { setError(`Event ${i + 1}: player number is required.`); return { success: false } }
          if (e.penalties.length === 0) { setError(`Event ${i + 1}: select a penalty type.`); return { success: false } }
        }
        if (e.type === 'other') {
          if (!e.title.trim()) { setError(`Event ${i + 1}: enter a title for this event.`); return { success: false } }
          if (!e.descriptor.trim()) { setError(`Event ${i + 1}: enter a descriptor for this event.`); return { success: false } }
        }
      }

      for (let i = 0; i < sbPlayerAnswers.length; i++) {
        const a = sbPlayerAnswers[i]
        if (!a.player.trim()) { setError(`Answer ${i + 1}: player number is required.`); return { success: false } }
        if (!a.already_expired && !a.wash_out && !parseGT(a.correct_gt)) { setError(`Answer ${i + 1}: enter a correct time or mark as Wash Out.`); return { success: false } }
        if (!a.already_expired && !a.wash_out && !gtSecondsValid(a.correct_gt)) { setError(`Answer ${i + 1}: seconds must be 0–59.`); return { success: false } }
      }

      payload = {
        text: text.trim(),
        answer_type: 'multiple_choice' as const,
        options: [],
        correct_answers: [],
        rationale: rationale.trim(),
        sub_questions: [{
          situation_type: sbSituationType,
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
        if (!sq.text.trim()) { setError(`Sub-question ${i + 1} is missing its question text.`); return { success: false } }
        const filled = sq.options.filter((o) => o.trim())
        if (filled.length < 2) { setError(`Sub-question ${i + 1} needs at least 2 answer options.`); return { success: false } }
        if (sq.correct_answers.length === 0) { setError(`Sub-question ${i + 1} has no correct answer selected.`); return { success: false } }
        if (!sq.rationale.trim()) { setError(`Sub-question ${i + 1} is missing a rationale.`); return { success: false } }
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
      if (correctAnswers.length === 0) { setError('Select at least one correct answer.'); return { success: false } }
      if (!rationale.trim()) { setError('Rationale is required.'); return { success: false } }
      const filledOptions = options.filter((o) => o.trim())
      if (filledOptions.length < 2) { setError('At least 2 answer options are required.'); return { success: false } }

      payload = {
        text: text.trim(),
        answer_type: mode as 'multiple_choice' | 'multi_select',
        options: filledOptions,
        correct_answers: correctAnswers,
        rationale: rationale.trim(),
        sub_questions: [],
        penalty_table: {
          teamA: penaltyA.filter((e) => e.player.trim() || e.penalties.trim()),
          teamB: penaltyB.filter((e) => e.player.trim() || e.penalties.trim()),
        },
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

    if (err) { setError(err.message); return { success: false } }
    return { success: true, payload }
  }

  async function handleSave() {
    const result = await doSave()
    if (!result.success) return
    await maybeShowMatchPrompt(result.payload!, () => { router.push(backUrl); router.refresh() })
  }

  async function handleSaveAndNext() {
    if (!nextId) return
    const result = await doSave()
    if (!result.success) return
    await maybeShowMatchPrompt(result.payload!, () => { router.push(`/admin/questions/${nextId}`); router.refresh() })
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
        {(mode === 'multiple_choice' || mode === 'multi_select' || mode === 'compound') && hasPenaltyTable ? (
          <PenaltyTableChipEditor
            minHeight={96}
            value={text}
            onChange={setText}
            placeholder={
              mode === 'compound'
                ? 'Describe the on-ice situation that all sub-questions below will refer to…'
                : 'Describe the on-ice situation or question…'
            }
          />
        ) : (
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
        )}
        {(mode === 'multiple_choice' || mode === 'multi_select' || mode === 'compound') && !hasPenaltyTable && (
          <div className="text-right">
            <button
              type="button"
              onClick={() => { setPenaltyA([emptyEntry()]); setPenaltyB([]); appendPenaltyTableMarker() }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              + Add Penalty Table
            </button>
          </div>
        )}
        {(mode === 'multiple_choice' || mode === 'multi_select' || mode === 'compound') && hasPenaltyTable && (
          hasPenaltyTableMarker(text) ? (
            <p className="text-[11px] text-gray-400">
              The blue <span className="text-blue-600 font-semibold">Penalty Table</span> chip shows where the table
              will appear. Click it once to pick it up, then click anywhere in the text to drop it there.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-[11px] text-amber-600">
                This question has a penalty table but no placement set yet — it currently displays above the text (legacy position).
              </p>
              <button
                type="button"
                onClick={appendPenaltyTableMarker}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
              >
                + Place Penalty Table in Text
              </button>
            </div>
          )
        )}
      </div>

      {/* Penalty table (shown for standard and compound questions) */}
      {(mode === 'multiple_choice' || mode === 'multi_select' || mode === 'compound') && hasPenaltyTable && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-2 divide-x divide-gray-200">
                  {(['A', 'B'] as const).map((team) => {
                    const entries = team === 'A' ? penaltyA : penaltyB
                    const setEntries = team === 'A' ? setPenaltyA : setPenaltyB
                    return (
                      <div key={team} className="min-w-0">
                        <div className={`px-3 py-2 text-[11px] font-bold uppercase tracking-widest border-b border-gray-200 ${team === 'A' ? 'text-blue-600' : 'text-red-600'} bg-gray-50`}>
                          Team {team}
                        </div>
                        <div className="divide-y divide-gray-100">
                          {entries.map((entry, i) => (
                            <div key={i} className="flex items-center gap-1.5 px-2 py-1.5">
                              <span className="text-sm font-mono text-gray-500 shrink-0">#</span>
                              <input
                                type="text"
                                value={entry.player}
                                onChange={(e) => updateEntry(team, i, 'player', e.target.value)}
                                placeholder="45"
                                className="w-10 text-sm border border-gray-300 rounded px-1.5 py-1 font-mono"
                              />
                              <input
                                type="text"
                                value={entry.penalties}
                                onChange={(e) => updateEntry(team, i, 'penalties', e.target.value)}
                                placeholder="2+2+5"
                                className="flex-1 min-w-0 text-sm border border-gray-300 rounded px-2 py-1"
                              />
                              <input
                                type="text"
                                value={entry.time ?? ''}
                                onChange={(e) => updateEntry(team, i, 'time', maskGameTime(e.target.value))}
                                placeholder="mm:ss"
                                className="w-24 text-sm border border-gray-300 rounded px-2 py-1 font-mono placeholder:text-gray-400 shrink-0"
                              />
                              <button
                                type="button"
                                onClick={() => removeEntry(team, i)}
                                className="text-gray-400 hover:text-red-500 text-lg leading-none shrink-0"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="px-2 py-1.5 border-t border-gray-100">
                          <button
                            type="button"
                            onClick={() => setEntries((prev) => [...prev, emptyEntry()])}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            + Add player
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-gray-400">
                    * If a field is not populated, the user will not see it. Additionally if only one team column is populated, the other team's column won&apos;t appear
                  </span>
                  <button
                    type="button"
                    onClick={() => { setPenaltyA([]); setPenaltyB([]); removePenaltyTableMarker() }}
                    className="text-xs text-red-400 hover:text-red-600 shrink-0"
                  >
                    Remove table
                  </button>
                </div>
              </div>
      )}

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

          {/* Situation Type */}
          <div className="space-y-2">
            <Label>Situation Type</Label>
            <div className="flex gap-2">
              {([
                { value: 'expiration', label: 'Penalty Expiration' },
                { value: 'coincidental', label: 'Coincidental Penalty' },
              ] as { value: ScoreboardSituationType; label: string }[]).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSbSituationType(value)}
                  className={`px-4 h-9 rounded-md border text-sm font-medium transition-all ${
                    sbSituationType === value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

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
                          {(['penalty', 'goal', 'other'] as const).map((t) => (
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

                      {evt.type !== 'other' && (
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
                      )}

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

                    {/* Other event: custom title + descriptor */}
                    {evt.type === 'other' && (
                      <div className="space-y-2">
                        <div className="space-y-0.5">
                          <label className="text-xs text-gray-400">Title <span className="text-gray-300">(shown where "Penalty"/"Goal" normally appears)</span></label>
                          <Input
                            value={evt.title}
                            onChange={(e) => updateSbEvent(i, 'title', e.target.value)}
                            placeholder="e.g. Leaving the Penalty Box Early"
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-xs text-gray-400">Descriptor</label>
                          <AutoResizeTextarea
                            value={evt.descriptor}
                            onChange={(val) => updateSbEvent(i, 'descriptor', val)}
                            placeholder="e.g. A#5 left the penalty box early on their own accord with 0:02 remaining"
                            className="text-sm"
                          />
                        </div>
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
              {sbSituationType === 'coincidental'
                ? <>For each player, enter the time remaining, mark as <strong>Coincidental Penalty</strong> if their penalty does not appear on the scoreboard because it coincides with an opposing penalty.</>
                : <>For each player, enter the time remaining, mark as <strong>Wash Out</strong> if their penalty is released by the goal, or mark as <strong>Already Expired</strong> if the penalty finished before the key event.</>
              }
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

                  {/* Time input — hidden when already_expired or wash_out */}
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

                  {/* Wash Out / Coincidental Penalty toggle — hidden when already_expired */}
                  {!ans.already_expired && (
                    <button
                      type="button"
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
                      {sbSituationType === 'coincidental' ? 'Coincidental Penalty' : 'Wash Out'}
                    </button>
                  )}

                  {/* Already Expired toggle — only for Penalty Expiration situations */}
                  {sbSituationType === 'expiration' && (
                    <button
                      type="button"
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
                  )}
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
              type="button"
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
                  situationType={sbSituationType}
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
          <div className="flex gap-4 h-9 items-center">
            {(['NHL', 'AHL'] as const).map((l) => (
              <label key={l} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={league.includes(l)}
                  onChange={() => toggleLeague(l)}
                  className="h-4 w-4"
                />
                {l}
              </label>
            ))}
          </div>
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
        <Button variant="outline" onClick={handleCancel}>Cancel</Button>
        {question?.id && (
          <Button variant="destructive" onClick={deleteQuestion}>Delete</Button>
        )}
      </div>

      <MatchPromptDialog
        open={!!matchPrompt}
        onOpenChange={(open) => {
          if (!open) {
            const navigate = matchPrompt?.navigate
            setMatchPrompt(null)
            navigate?.()
          }
        }}
        groups={matchPrompt?.groups ?? []}
        canAutoUpdate={matchPrompt?.canAutoUpdate ?? false}
        onReviewManually={handleReviewManually}
        onAutoUpdate={handleAutoUpdate}
      />

      {autoUpdateState && (
        <AutoUpdatePreviewDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              const navigate = autoUpdateState.navigate
              setAutoUpdateState(null)
              navigate()
            }
          }}
          targetQuestions={autoUpdateState.targetQuestions}
          payload={autoUpdateState.payload}
          onConfirm={confirmAutoUpdate}
        />
      )}
    </div>
  )
}
