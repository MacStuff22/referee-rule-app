'use client'

// ============================================================
// Shared quiz-taking engine
//
// Renders one question (standard/compound/scoreboard) and handles all
// interaction — option selection, compound sub-question progression,
// scoreboard simulation — entirely through the `onAnswered`/`onNext`
// callbacks. It has no knowledge of Supabase or any other persistence
// mechanism; the parent decides what happens with an answer (write it to
// quiz_answers for a real quiz, or just hold it in memory for a Test Quiz).
//
// Mount with `key={question.id}` so per-question state resets automatically
// when the question changes — the same pattern ScoreboardSimulator already
// uses internally.
// ============================================================

import { useRef, useState } from 'react'
import { Check, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ScoreboardSimulator } from '@/components/quiz/scoreboard-simulator'
import { encodeCompoundAnswer, type ScoreboardAnswerEntry } from '@/lib/quiz/answers'
import { parseScoreboardConfig } from '@/types/scoreboard'
import { splitOnPenaltyTableMarker, stripPenaltyTableMarker } from '@/lib/penaltyTable'
import type { Question, SubQuestion } from '@/types'

type AnswerState = 'unanswered' | 'correct' | 'incorrect'

export interface QuizAnsweredResult {
  isCorrect: boolean
}

export interface QuizRunnerProps {
  question: Question
  progress: { current: number; total: number }
  /**
   * Hands the raw selected answer to the parent and waits for it to say
   * whether it's correct — the parent (or, for the real quiz, the server
   * behind it) is the authority on correctness, not QuizRunner itself.
   */
  onAnswered: (selectedAnswers: unknown) => Promise<QuizAnsweredResult>
  onNext: () => void | Promise<void>
  nextLabel: string
  /** Lets the user leave before finishing. Answers already submitted stay recorded; the parent decides what "leaving" means (end the session and show results, or return to setup). Omit to hide the exit control entirely. */
  onExit?: () => void
  /** Shows the league/category/rule badges above the progress bar — useful for the admin's Test Quiz preview, noise for a real user taking the quiz. Defaults to hidden. */
  showMeta?: boolean
}

function PenaltyTableBlock({ penA, penB }: { penA: any[]; penB: any[] }) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-slate-200">
        {(['A', 'B'] as const).filter((team) => (team === 'A' ? penA : penB).length > 0).map((team) => {
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
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
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

function shuffleIndices(count: number): number[] {
  const arr = Array.from({ length: count }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const SELECT_ALL_HINT = 'Select all that apply'

function MultiSelectHint() {
  return (
    <Badge variant="outline" className="mb-4 gap-1.5 border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
      <ListChecks className="h-3.5 w-3.5" />
      {SELECT_ALL_HINT}
    </Badge>
  )
}

function needsSingleAnswerConfirm(answerType: string, selectedCount: number, correctCount: number) {
  return answerType === 'multi_select' && selectedCount === 1 && correctCount > 1
}

export function QuizRunner({ question, progress, onAnswered, onNext, nextLabel, onExit, showMeta = false }: QuizRunnerProps) {
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Confirmation gate for submitting a multi-select question with only one option checked.
  // Dialog is open whenever there's a submit waiting on confirmation.
  const [pendingSubmit, setPendingSubmit] = useState<null | (() => void)>(null)

  // Guards doSubmitAnswer/doSubmitCompoundAnswer against firing twice from a fast
  // double-click/double-tap on "Submit anyway", which bypasses the normal button's guards.
  const submitLockRef = useRef(false)

  // Standard question state
  const [selected, setSelected] = useState<number[]>([])
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered')
  const [shuffledOrder] = useState<number[]>(() =>
    question.question_type !== 'compound' && question.question_type !== 'scoreboard'
      ? shuffleIndices(question.options.length)
      : []
  )

  // Compound question state
  const [compoundSubIndex, setCompoundSubIndex] = useState(0)
  const [compoundSubAnswers, setCompoundSubAnswers] = useState<number[][]>([])
  const [compoundSubCorrect, setCompoundSubCorrect] = useState<boolean[]>([])
  const [subShuffledOrders] = useState<number[][]>(() =>
    question.question_type === 'compound'
      ? (question.sub_questions ?? []).map((sq: any) => shuffleIndices(sq.options.length))
      : []
  )

  function toggleOption(originalIdx: number) {
    if (answerState !== 'unanswered') return
    const effectiveAnswerType =
      question.question_type === 'compound'
        ? (question.sub_questions[compoundSubIndex]?.answer_type ?? 'multiple_choice')
        : question.answer_type
    if (effectiveAnswerType === 'multiple_choice') {
      setSelected([originalIdx])
    } else {
      setSelected((prev) =>
        prev.includes(originalIdx) ? prev.filter((i) => i !== originalIdx) : [...prev, originalIdx]
      )
    }
  }

  // ─── Shared option-list rendering (standard + compound both call this) ──────

  function renderOptions(options: string[], correctAnswers: number[], order: number[], isMultiSelect: boolean) {
    const isAnswered = answerState !== 'unanswered'
    return (
      <div
        className="space-y-2 mt-3"
        role={isMultiSelect ? 'group' : 'radiogroup'}
        aria-label={isMultiSelect ? SELECT_ALL_HINT : 'Select one answer'}
      >
        {order.map((originalIdx, displayIdx) => {
          const opt = options[originalIdx]
          const isSelected = selected.includes(originalIdx)
          const isCorrect = correctAnswers.includes(originalIdx)
          let style = 'border-gray-200 bg-white hover:border-gray-300'
          let glyphStyle = 'border-gray-400 bg-white'

          // The glyph only ever reflects the user's own selection (isSelected) --
          // never the revealed answer key -- so a radio never shows two "on" dots
          // at once, and aria-checked always matches what's visually filled in.
          // Correctness after answering is conveyed by the row/glyph border color instead.
          if (isAnswered) {
            if (isCorrect) {
              style = 'border-green-500 bg-green-50 text-green-900'
              glyphStyle = isSelected ? 'bg-green-600 border-green-600' : 'border-green-500 bg-white'
            } else if (isSelected && !isCorrect) {
              style = 'border-red-400 bg-red-50 text-red-900'
              glyphStyle = 'bg-red-500 border-red-500'
            } else {
              glyphStyle = 'border-gray-300 bg-white'
            }
          } else if (isSelected) {
            style = 'border-slate-900 bg-slate-50'
            glyphStyle = 'bg-slate-900 border-slate-900'
          }

          return (
            <button
              key={originalIdx}
              onClick={() => toggleOption(originalIdx)}
              disabled={isAnswered}
              role={isMultiSelect ? 'checkbox' : 'radio'}
              aria-checked={isSelected}
              className={`w-full text-left px-4 py-3 rounded-lg border-2 text-sm transition-all flex items-center gap-3 ${style}`}
            >
              <span
                aria-hidden="true"
                className={`shrink-0 flex items-center justify-center w-4 h-4 border-2 ${isMultiSelect ? 'rounded' : 'rounded-full'} ${glyphStyle}`}
              >
                {isSelected && (isMultiSelect ? (
                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                ))}
              </span>
              <span>
                <span className="font-medium mr-2">{String.fromCharCode(65 + displayIdx)}.</span>
                {renderOptionText(opt)}
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  function renderSelectedCount(answerType: string) {
    if (answerType !== 'multi_select' || selected.length === 0) return null
    return <p className="text-xs text-gray-500 text-right">{selected.length} selected</p>
  }

  // ─── Standard question submit ───────────────────────────────────────────────

  async function doSubmitAnswer() {
    if (submitLockRef.current) return
    submitLockRef.current = true
    setSubmitting(true)
    try {
      const result = await onAnswered(selected)
      setAnswerState(result.isCorrect ? 'correct' : 'incorrect')
    } finally {
      setSubmitting(false)
    }
  }

  function submitAnswer() {
    if (selected.length === 0 || submitting) return
    if (needsSingleAnswerConfirm(question.answer_type, selected.length, question.correct_answers.length)) {
      setPendingSubmit(() => doSubmitAnswer)
      return
    }
    doSubmitAnswer()
  }

  // ─── Compound question submit ───────────────────────────────────────────────

  function doSubmitCompoundAnswer(subQ: SubQuestion) {
    if (submitLockRef.current) return
    submitLockRef.current = true
    // Per-part reveal stays local -- it's already visible information
    // (sub_questions[i].correct_answers is part of the fetched question),
    // not the security boundary. Only the final persisted row's is_correct
    // is decided by the parent (server-verified for the real quiz).
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
      onAnswered(encodeCompoundAnswer(newSubAnswers))
    }
  }

  function submitCompoundAnswer() {
    if (selected.length === 0) return
    const subQ = question.sub_questions[compoundSubIndex]
    if (needsSingleAnswerConfirm(subQ.answer_type, selected.length, subQ.correct_answers.length)) {
      setPendingSubmit(() => () => doSubmitCompoundAnswer(subQ))
      return
    }
    doSubmitCompoundAnswer(subQ)
  }

  function advanceSubQuestion() {
    setCompoundSubIndex((i) => i + 1)
    setSelected([])
    setAnswerState('unanswered')
    submitLockRef.current = false
  }

  // ─── Scoreboard question submit (invoked by ScoreboardSimulator) ─────────────

  async function saveScoreboardAnswer(entries: ScoreboardAnswerEntry[]): Promise<QuizAnsweredResult> {
    return onAnswered(entries)
  }

  // ─── Shared progress bar ─────────────────────────────────────────────────────

  const progressBar = (
    <div className="space-y-1">
      {onExit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setExitConfirmOpen(true)}
            className="text-xs text-gray-400 hover:text-red-500"
          >
            Exit Quiz
          </button>
        </div>
      )}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Question {progress.current} of {progress.total}</span>
        {showMeta && (
          <div className="flex gap-2">
            <Badge variant="outline">{question.league.join(' & ')}</Badge>
            <Badge variant="outline">{question.category}</Badge>
            <Badge variant="outline">Rule {question.rule_number}</Badge>
          </div>
        )}
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div
          className="bg-slate-900 h-1.5 rounded-full transition-all"
          style={{ width: `${(progress.current / progress.total) * 100}%` }}
        />
      </div>
    </div>
  )

  const exitDialog = onExit ? (
    <Dialog open={exitConfirmOpen} onOpenChange={setExitConfirmOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exit this quiz?</DialogTitle>
          <DialogDescription>
            Everything you&apos;ve already submitted stays recorded. This question won&apos;t be counted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setExitConfirmOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => { setExitConfirmOpen(false); onExit() }}>Exit Quiz</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null

  const confirmSingleDialog = (
    <Dialog open={pendingSubmit !== null} onOpenChange={(open) => { if (!open) setPendingSubmit(null) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit with just one answer?</DialogTitle>
          <DialogDescription>
            This question allows more than one correct answer, and you&apos;ve only selected one.
            You can go back and review, or submit as-is.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingSubmit(null)}>Review answers</Button>
          <Button onClick={() => { const submit = pendingSubmit; setPendingSubmit(null); submit?.() }}>Submit anyway</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  // ─── Compound question render ────────────────────────────────────────────────

  if (question.question_type === 'compound') {
    const subQs = question.sub_questions ?? []
    const subQ = subQs[compoundSubIndex]
    const shuffleOrder = subShuffledOrders[compoundSubIndex] ?? subQ.options.map((_: any, i: number) => i)
    const isLastSubQ = compoundSubIndex === subQs.length - 1

    const compoundPenaltyTable = (question as any).penalty_table as { teamA?: any[]; teamB?: any[] } | null
    const compoundPenA: any[] = compoundPenaltyTable?.teamA ?? []
    const compoundPenB: any[] = compoundPenaltyTable?.teamB ?? []
    const compoundHasTable = compoundPenA.length > 0 || compoundPenB.length > 0
    const compoundSplit = compoundHasTable ? splitOnPenaltyTableMarker(question.text) : null

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {progressBar}

        <div className="rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3 space-y-3">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Situation</p>
          {compoundSplit ? (
            <>
              {compoundSplit.before && <p className="text-sm text-blue-900 leading-relaxed">{compoundSplit.before}</p>}
              <PenaltyTableBlock penA={compoundPenA} penB={compoundPenB} />
              {compoundSplit.after && <p className="text-sm text-blue-900 leading-relaxed">{compoundSplit.after}</p>}
            </>
          ) : (
            <p className="text-sm text-blue-900 leading-relaxed">{stripPenaltyTableMarker(question.text)}</p>
          )}
        </div>

        {!compoundSplit && compoundHasTable && (
          <PenaltyTableBlock penA={compoundPenA} penB={compoundPenB} />
        )}

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
            {subQ.answer_type === 'multi_select' && <MultiSelectHint />}
            {renderOptions(subQ.options, subQ.correct_answers, shuffleOrder, subQ.answer_type === 'multi_select')}
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
              {question.situation_id && (
                <p className="text-sm text-gray-500">
                  <span className="font-medium">📍 Situation {question.situation_id}</span>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {answerState === 'unanswered' ? (
          <div className="space-y-1">
            {renderSelectedCount(subQ.answer_type)}
            <Button onClick={submitCompoundAnswer} disabled={selected.length === 0} className="w-full" size="lg">
              Submit Answer
            </Button>
          </div>
        ) : !isLastSubQ ? (
          <Button onClick={advanceSubQuestion} className="w-full" size="lg">Next Part →</Button>
        ) : (
          <Button onClick={onNext} className="w-full" size="lg">
            {nextLabel}
          </Button>
        )}
        {exitDialog}
        {confirmSingleDialog}
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
          <Button onClick={onNext} className="w-full" size="lg">
            {nextLabel}
          </Button>
          {exitDialog}
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
          situationId={question.situation_id}
          revealAnswer
          onSubmit={saveScoreboardAnswer}
          onNext={onNext}
          nextLabel={nextLabel}
        />
        {exitDialog}
      </div>
    )
  }

  // ─── Standard question render ────────────────────────────────────────────────

  const penaltyTable = (question as any).penalty_table as { teamA?: any[]; teamB?: any[] } | null
  const penA: any[] = penaltyTable?.teamA ?? []
  const penB: any[] = penaltyTable?.teamB ?? []
  const hasTable = penA.length > 0 || penB.length > 0
  const split = hasTable ? splitOnPenaltyTableMarker(question.text) : null

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {progressBar}

      {/* Penalty table — legacy placement (no marker in text) */}
      {!split && hasTable && <PenaltyTableBlock penA={penA} penB={penB} />}

      <Card>
        <CardContent className="pt-6">
          {split ? (
            <>
              {split.before && <p className="font-medium text-gray-900 text-base leading-relaxed mb-3">{split.before}</p>}
              <div className="mb-3">
                <PenaltyTableBlock penA={penA} penB={penB} />
              </div>
              {split.after && <p className="font-medium text-gray-900 text-base leading-relaxed mb-1">{split.after}</p>}
            </>
          ) : (
            <p className="font-medium text-gray-900 text-base leading-relaxed mb-1">
              {stripPenaltyTableMarker(question.text)}
            </p>
          )}
          {question.answer_type === 'multi_select' && <MultiSelectHint />}

          {renderOptions(
            question.options,
            question.correct_answers,
            shuffledOrder.length === question.options.length ? shuffledOrder : question.options.map((_, i) => i),
            question.answer_type === 'multi_select'
          )}
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
            {question.situation_id && (
              <p className="text-sm text-gray-500">
                <span className="font-medium">📍 Situation {question.situation_id}</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {answerState === 'unanswered' ? (
        <div className="space-y-1">
          {renderSelectedCount(question.answer_type)}
          <Button onClick={submitAnswer} disabled={selected.length === 0 || submitting} className="w-full" size="lg">
            Submit Answer
          </Button>
        </div>
      ) : (
        <Button onClick={onNext} className="w-full" size="lg">
          {nextLabel}
        </Button>
      )}
      {exitDialog}
      {confirmSingleDialog}
    </div>
  )
}
