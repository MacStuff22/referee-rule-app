'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { LinkButton } from '@/components/ui/link-button'
import type { Question } from '@/types'

type SortKey = 'status' | 'situation_id' | 'rule' | 'category' | 'section' | 'created'
type SortDir = 'asc' | 'desc'

const SECTION_OPTIONS = [
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

function parseSituationId(id: string): { num: number; letters: string } {
  const match = id.match(/^(\d+)([A-Z]*)$/i)
  if (!match) return { num: Infinity, letters: id }
  return { num: parseInt(match[1], 10), letters: match[2].toUpperCase() }
}

function compareSituationIds(a: string, b: string): number {
  const pa = parseSituationId(a || '')
  const pb = parseSituationId(b || '')
  if (pa.num !== pb.num) return pa.num - pb.num
  if (pa.letters.length !== pb.letters.length) return pa.letters.length - pb.letters.length
  return pa.letters.localeCompare(pb.letters)
}

function buildUrlParams(state: {
  sortKey: SortKey; sortDir: SortDir; filterStatus: string
  filterSection: string; filterCategory: string; search: string
}): string {
  const p = new URLSearchParams()
  if (state.sortKey !== 'created') p.set('sort', state.sortKey)
  if (state.sortDir !== 'desc') p.set('dir', state.sortDir)
  if (state.filterStatus !== 'all') p.set('status', state.filterStatus)
  if (state.filterSection) p.set('section', state.filterSection)
  if (state.filterCategory) p.set('cat', state.filterCategory)
  if (state.search) p.set('q', state.search)
  const s = p.toString()
  return s ? `?${s}` : ''
}

interface Props {
  questions: Question[]
}

export default function QuestionsClient({ questions }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Initialise from URL params so refreshing / back-button restores the view
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved'>(
    () => (searchParams.get('status') as any) ?? 'all'
  )
  const [filterSection, setFilterSection] = useState(() => searchParams.get('section') ?? '')
  const [filterCategory, setFilterCategory] = useState(() => searchParams.get('cat') ?? '')
  const [sortKey, setSortKey] = useState<SortKey>(
    () => (searchParams.get('sort') as SortKey) ?? 'created'
  )
  const [sortDir, setSortDir] = useState<SortDir>(
    () => (searchParams.get('dir') as SortDir) ?? 'desc'
  )

  const allCategories = useMemo(() => {
    const cats = new Set(questions.map((q) => q.category).filter(Boolean))
    return Array.from(cats).sort()
  }, [questions])

  const filtered = useMemo(() => {
    let result = questions.filter((q) => {
      if (filterStatus === 'approved' && !q.is_approved) return false
      if (filterStatus === 'pending' && q.is_approved) return false
      if (filterSection && q.handbook_section !== filterSection) return false
      if (filterCategory && q.category !== filterCategory) return false
      if (search) {
        const s = search.toLowerCase()
        const refs = (q.rule_references ?? []).join(' ').toLowerCase()
        return (
          q.text.toLowerCase().includes(s) ||
          q.situation_id?.toLowerCase().includes(s) ||
          q.category.toLowerCase().includes(s) ||
          refs.includes(s)
        )
      }
      return true
    })

    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'situation_id') {
        cmp = compareSituationIds(a.situation_id ?? '', b.situation_id ?? '')
      } else {
        let av = '', bv = ''
        if (sortKey === 'status') { av = a.is_approved ? '1' : '0'; bv = b.is_approved ? '1' : '0' }
        else if (sortKey === 'rule') { av = a.rule_number ?? ''; bv = b.rule_number ?? '' }
        else if (sortKey === 'category') { av = a.category ?? ''; bv = b.category ?? '' }
        else if (sortKey === 'section') { av = a.handbook_section ?? ''; bv = b.handbook_section ?? '' }
        else { av = a.created_at; bv = b.created_at }
        cmp = av.localeCompare(bv)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [questions, filterStatus, filterSection, filterCategory, search, sortKey, sortDir])

  const currentState = { sortKey, sortDir, filterStatus, filterSection, filterCategory, search }

  // Sync sort/filter to URL so browser back button restores the view
  useEffect(() => {
    const qs = buildUrlParams(currentState)
    router.replace(`/admin/questions${qs}`, { scroll: false } as any)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortDir, filterStatus, filterSection, filterCategory, search])

  // Keep sessionStorage queue in sync so the edit page can do "Save & Next"
  useEffect(() => {
    const qs = buildUrlParams(currentState)
    sessionStorage.setItem('question_queue', JSON.stringify({
      ids: filtered.map((q) => q.id),
      backUrl: `/admin/questions${qs}`,
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const pending = questions.filter((q) => !q.is_approved).length
  const approved = questions.filter((q) => q.is_approved).length

  return (
    <div className="space-y-4">
      {/* Summary counts */}
      <div className="flex gap-3 flex-wrap">
        <div className="text-sm px-3 py-1.5 rounded-full bg-yellow-100 text-yellow-800 font-medium">
          {pending} pending review
        </div>
        <div className="text-sm px-3 py-1.5 rounded-full bg-green-100 text-green-800 font-medium">
          {approved} approved
        </div>
        <div className="text-sm px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 font-medium">
          {questions.length} total
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              className="w-full border rounded-md px-2 py-1.5 text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Section</label>
            <select
              className="w-full border rounded-md px-2 py-1.5 text-sm"
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
            >
              <option value="">All Sections</option>
              {SECTION_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <select
              className="w-full border rounded-md px-2 py-1.5 text-sm"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Text, rule, situation ID…"
              className="text-sm h-8"
            />
          </div>
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t">
          <span className="text-xs font-medium text-gray-500">Sort:</span>
          {([
            ['status', 'Status'],
            ['situation_id', 'Situation ID'],
            ['rule', 'Rule'],
            ['category', 'Category'],
            ['section', 'Section'],
            ['created', 'Date Added'],
          ] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                sortKey === key
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'border-gray-200 text-gray-600 hover:border-gray-400'
              }`}
            >
              {label} {sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
          ))}
          {filtered.length !== questions.length && (
            <button
              onClick={() => { setFilterStatus('all'); setFilterSection(''); setFilterCategory(''); setSearch('') }}
              className="ml-auto text-xs text-blue-600 hover:underline"
            >
              Clear filters ({filtered.length} shown)
            </button>
          )}
        </div>
      </div>

      {/* Question list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No questions match the current filters.</p>
      ) : (
        <div className="bg-white border rounded-xl divide-y">
          {filtered.map((q) => (
            <div key={q.id} className="px-4 py-3 flex items-start gap-4">
              <div className="shrink-0 mt-0.5">
                {q.is_approved ? (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs font-bold">✓</span>
                ) : (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-bold">!</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{q.text}</p>
                <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">
                  {q.situation_id && (
                    <Badge className="text-xs bg-slate-800 text-white hover:bg-slate-700">{q.situation_id}</Badge>
                  )}
                  {(q.rule_references?.length ? q.rule_references : q.rule_number ? [q.rule_number] : []).map((ref) => (
                    <Badge key={ref} variant="outline" className="text-xs font-mono">Rule {ref}</Badge>
                  ))}
                  <Badge variant="outline" className="text-xs">{q.category}</Badge>
                  {q.handbook_section && (
                    <span className="text-xs text-gray-400">{q.handbook_section}</span>
                  )}
                  <Badge variant="secondary" className="text-xs">{q.league}</Badge>
                </div>
              </div>
              <LinkButton href={`/admin/questions/${q.id}`} variant="ghost" size="sm" className="shrink-0">Edit</LinkButton>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
