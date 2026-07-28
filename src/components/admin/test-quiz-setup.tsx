'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { HANDBOOK_SECTIONS } from '@/lib/constants'
import { getQuestionMode, QUESTION_MODE_LABELS, type QuestionMode } from '@/lib/questionMode'
import { QUESTION_FEATURES } from '@/lib/questionFeatures'
import { compareSituationIds } from '@/lib/situationId'
import type { League, Question } from '@/types'

interface Props {
  questions: Question[]
  onStart: (selected: Question[]) => void
}

const QUIZ_LENGTHS = [5, 10, 15, 'unlimited'] as const
type QuizLength = (typeof QUIZ_LENGTHS)[number]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function FeatureFilterDropdown({
  selected,
  onChange,
}: {
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs font-medium text-gray-500 mb-1">Question Features</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full border rounded-md px-2 py-1.5 text-sm text-left bg-white flex items-center justify-between gap-1"
      >
        <span className={selected.size === 0 ? 'text-gray-400' : ''}>
          {selected.size === 0 ? 'Any' : `${selected.size} selected`}
        </span>
        <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full min-w-[220px] bg-white border rounded-md shadow-md py-1">
          {QUESTION_FEATURES.map((f) => (
            <label key={f.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} />
              {f.label}
            </label>
          ))}
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:underline border-t mt-1 pt-1.5"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function TestQuizSetup({ questions, onStart }: Props) {
  const allCategories = useMemo(() => {
    const cats = new Set(questions.map((q) => q.category).filter(Boolean))
    return Array.from(cats).sort()
  }, [questions])

  const allSituationIds = useMemo(() => {
    const ids = new Set(questions.map((q) => q.situation_id).filter(Boolean))
    return Array.from(ids).sort(compareSituationIds)
  }, [questions])

  const [questionType, setQuestionType] = useState<QuestionMode | ''>('')
  const [features, setFeatures] = useState<Set<string>>(new Set())
  const [handbookSection, setHandbookSection] = useState('')
  const [situationId, setSituationId] = useState('')
  const [category, setCategory] = useState('')
  const [league, setLeague] = useState<League | ''>('')
  const [search, setSearch] = useState('')
  // Questions explicitly excluded from the current filtered view. Selection
  // is always relative to `filtered` (never a standalone list of ids), so
  // there is no way for a question that's fallen out of view -- because a
  // filter changed -- to silently stay "selected" and slip into the quiz.
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const [shuffleOrder, setShuffleOrder] = useState(true)
  const [quizLength, setQuizLength] = useState<QuizLength | null>(null)

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (questionType && getQuestionMode(q) !== questionType) return false
      if (handbookSection && q.handbook_section !== handbookSection) return false
      if (situationId && q.situation_id !== situationId) return false
      if (category && q.category !== category) return false
      if (league) {
        // A question marked "both" counts toward NHL and AHL, but selecting
        // "Both" itself should only match questions marked exactly "both".
        const matchesLeague = q.league === league || (league !== 'both' && q.league === 'both')
        if (!matchesLeague) return false
      }
      if (features.size > 0 && !QUESTION_FEATURES.some((f) => features.has(f.id) && f.matches(q))) return false
      if (search) {
        const s = search.toLowerCase()
        return (
          q.text.toLowerCase().includes(s) ||
          q.situation_id?.toLowerCase().includes(s) ||
          q.category.toLowerCase().includes(s)
        )
      }
      return true
    })
  }, [questions, questionType, handbookSection, situationId, category, league, features, search])

  // Whenever the filtered set changes, start fresh: everything currently
  // shown is selected by default, and any leftover exclusions from a
  // previous, different filter view no longer apply.
  useEffect(() => {
    setDeselected(new Set())
    setQuizLength(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered])

  const selectedCount = filtered.length - deselected.size

  function toggleChecked(id: string) {
    setDeselected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function applyQuizLength(length: QuizLength) {
    setQuizLength(length)
    const chosenIds = new Set(
      length === 'unlimited' ? filtered.map((q) => q.id) : shuffle(filtered).slice(0, length).map((q) => q.id)
    )
    setDeselected(new Set(filtered.filter((q) => !chosenIds.has(q.id)).map((q) => q.id)))
  }

  function selectAllFiltered() {
    setDeselected(new Set())
  }

  function deselectAll() {
    setDeselected(new Set(filtered.map((q) => q.id)))
  }

  function clearFilters() {
    setQuestionType('')
    setFeatures(new Set())
    setHandbookSection('')
    setSituationId('')
    setCategory('')
    setLeague('')
    setSearch('')
  }

  const filtersActive =
    questionType || features.size > 0 || handbookSection || situationId || category || league || search

  function handleStart() {
    let chosen = filtered.filter((q) => !deselected.has(q.id))
    if (shuffleOrder) chosen = shuffle(chosen)
    onStart(chosen)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Pick categories and/or specific questions to preview exactly as an end user would see them. Nothing here is
        recorded — progress and answers reset once you leave this page.
      </p>

      {/* Quiz length */}
      <div className="bg-white border rounded-xl p-4 space-y-2">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Quiz Length</label>
            <div className="flex gap-1.5">
              {QUIZ_LENGTHS.map((len) => (
                <button
                  key={len}
                  type="button"
                  onClick={() => applyQuizLength(len)}
                  className={`px-4 h-9 rounded-md border text-sm font-medium transition-all ${
                    quizLength === len
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {len === 'unlimited' ? 'Unlimited' : len}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={handleStart} disabled={selectedCount === 0} size="lg">
            Start Test Quiz ({selectedCount})
          </Button>
        </div>
        <p className="text-xs text-gray-400">
          Randomly selects that many questions from the filters below ({filtered.length} currently match). You can
          still adjust the selection by hand afterward.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Question Type</label>
            <select
              className="w-full border rounded-md px-2 py-1.5 text-sm"
              value={questionType}
              onChange={(e) => setQuestionType(e.target.value as QuestionMode | '')}
            >
              <option value="">All Types</option>
              {(Object.entries(QUESTION_MODE_LABELS) as [QuestionMode, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <FeatureFilterDropdown selected={features} onChange={setFeatures} />

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Handbook Section</label>
            <select
              className="w-full border rounded-md px-2 py-1.5 text-sm"
              value={handbookSection}
              onChange={(e) => setHandbookSection(e.target.value)}
            >
              <option value="">All Sections</option>
              {HANDBOOK_SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Situation ID</label>
            <select
              className="w-full border rounded-md px-2 py-1.5 text-sm"
              value={situationId}
              onChange={(e) => setSituationId(e.target.value)}
            >
              <option value="">All Situations</option>
              {allSituationIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <select
              className="w-full border rounded-md px-2 py-1.5 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">League</label>
            <select
              className="w-full border rounded-md px-2 py-1.5 text-sm"
              value={league}
              onChange={(e) => setLeague(e.target.value as League | '')}
            >
              <option value="">All Leagues</option>
              <option value="NHL">NHL</option>
              <option value="AHL">AHL</option>
              <option value="both">Both</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Text, situation ID…"
              className="text-sm h-8"
            />
          </div>
        </div>

        {filtersActive && (
          <div className="pt-1 border-t flex justify-end">
            <button type="button" onClick={clearFilters} className="text-xs text-blue-600 hover:underline">
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Question list */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b flex items-center justify-between bg-gray-50 flex-wrap gap-2">
          <span className="text-xs font-medium text-gray-500">
            {filtered.length} question{filtered.length === 1 ? '' : 's'} shown · {selectedCount} selected
          </span>
          <div className="flex gap-3">
            {deselected.size > 0 && (
              <button type="button" onClick={selectAllFiltered} className="text-xs text-blue-600 hover:underline">
                Select all shown
              </button>
            )}
            {selectedCount > 0 && (
              <button type="button" onClick={deselectAll} className="text-xs text-gray-500 hover:underline">
                Deselect all
              </button>
            )}
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No approved questions match.</p>
        ) : (
          <div className="divide-y max-h-[420px] overflow-y-auto">
            {filtered.map((q) => (
              <label key={q.id} className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={!deselected.has(q.id)}
                  onChange={() => toggleChecked(q.id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{q.text}</p>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">
                    {q.situation_id && (
                      <Badge className="text-xs bg-slate-800 text-white hover:bg-slate-700">{q.situation_id}</Badge>
                    )}
                    <Badge variant="outline" className="text-xs">{QUESTION_MODE_LABELS[getQuestionMode(q)]}</Badge>
                    <Badge variant="outline" className="text-xs">{q.category}</Badge>
                    <Badge variant="secondary" className="text-xs">{q.league}</Badge>
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={shuffleOrder} onChange={(e) => setShuffleOrder(e.target.checked)} />
        Shuffle question order
      </label>
    </div>
  )
}
