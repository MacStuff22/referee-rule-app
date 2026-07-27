'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { Question } from '@/types'

interface Props {
  questions: Question[]
  onStart: (selected: Question[]) => void
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function TestQuizSetup({ questions, onStart }: Props) {
  const allCategories = useMemo(() => {
    const cats = new Set(questions.map((q) => q.category).filter(Boolean))
    return Array.from(cats).sort()
  }, [questions])

  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [shuffleOrder, setShuffleOrder] = useState(true)

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (categoryFilter.size > 0 && !categoryFilter.has(q.category)) return false
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
  }, [questions, categoryFilter, search])

  function toggleCategory(cat: string) {
    setCategoryFilter((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  function toggleChecked(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllFiltered() {
    setChecked((prev) => {
      const next = new Set(prev)
      filtered.forEach((q) => next.add(q.id))
      return next
    })
  }

  function handleStart() {
    let chosen = questions.filter((q) => checked.has(q.id))
    if (shuffleOrder) chosen = shuffle(chosen)
    onStart(chosen)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Pick categories and/or specific questions to preview exactly as an end user would see them. Nothing here is
        recorded — progress and answers reset once you leave this page.
      </p>

      {/* Category filter */}
      <div className="bg-white border rounded-xl p-4 space-y-2">
        <label className="block text-xs font-medium text-gray-500">Filter by category</label>
        <div className="flex flex-wrap gap-1.5">
          {allCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                categoryFilter.has(cat)
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'border-gray-200 text-gray-600 hover:border-gray-400'
              }`}
            >
              {cat}
            </button>
          ))}
          {categoryFilter.size > 0 && (
            <button
              type="button"
              onClick={() => setCategoryFilter(new Set())}
              className="text-xs text-blue-600 hover:underline ml-1"
            >
              Clear
            </button>
          )}
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search text, situation ID…"
          className="text-sm h-8 mt-2"
        />
      </div>

      {/* Question list */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b flex items-center justify-between bg-gray-50 flex-wrap gap-2">
          <span className="text-xs font-medium text-gray-500">
            {filtered.length} question{filtered.length === 1 ? '' : 's'} shown · {checked.size} selected
          </span>
          <div className="flex gap-3">
            <button type="button" onClick={selectAllFiltered} className="text-xs text-blue-600 hover:underline">
              Select all shown
            </button>
            {checked.size > 0 && (
              <button type="button" onClick={() => setChecked(new Set())} className="text-xs text-gray-500 hover:underline">
                Clear selection
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
                  checked={checked.has(q.id)}
                  onChange={() => toggleChecked(q.id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{q.text}</p>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">
                    {q.situation_id && (
                      <Badge className="text-xs bg-slate-800 text-white hover:bg-slate-700">{q.situation_id}</Badge>
                    )}
                    <Badge variant="outline" className="text-xs">{q.category}</Badge>
                    <Badge variant="secondary" className="text-xs">{q.league}</Badge>
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Start */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={shuffleOrder} onChange={(e) => setShuffleOrder(e.target.checked)} />
          Shuffle question order
        </label>
        <Button onClick={handleStart} disabled={checked.size === 0} size="lg">
          Start Test Quiz ({checked.size})
        </Button>
      </div>
    </div>
  )
}
