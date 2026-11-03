'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CATEGORIES } from '@/lib/constants'
import { computeQuestionsPerDay, computeTargetEndDate, calendarDay } from '@/lib/quiz/paths'
import { RETAKE_PLAN_DEFAULTS } from '@/lib/quiz/pathReport'
import { resolveTimeZone } from '@/lib/timeZone'
import type { PathPoolFilter } from '@/types'

// The three pools the user can pick from; a retake pool is only ever pre-selected (see `retake`).
type PoolType = Exclude<PathPoolFilter['type'], 'missed_questions'>

const POOL_OPTIONS: { type: PoolType; label: string; description: string }[] = [
  { type: 'situation_book', label: 'Situation Book', description: 'Complete all questions listed in the NHL Situation Book' },
  { type: 'categories', label: 'Choose Rules', description: 'Choose specific rules to quiz yourself on' },
  { type: 'weak_areas', label: 'Weaknesses', description: 'Automatically selected rules that have been identified as your rulebook weak areas.' },
]

function defaultEndDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 90)
  return d.toISOString().slice(0, 10)
}

function poolFilterFor(poolType: PoolType, selectedCategories: string[]): PathPoolFilter {
  if (poolType === 'categories') return { type: 'categories', categories: selectedCategories }
  if (poolType === 'weak_areas') return { type: 'weak_areas', categories: [] }
  return { type: 'situation_book' }
}

export interface RetakeSource {
  sourcePathId: string
  sourceName: string
  /** How many questions of that plan are still being missed. */
  missedCount: number
}

function formatFinishDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** The Create a Study Plan form. With `retake` it opens pre-filled to retake the questions missed in a finished plan. */
export function NewPathForm({ retake = null }: { retake?: RetakeSource | null }) {
  const [retakeActive, setRetakeActive] = useState(retake !== null)
  const [poolType, setPoolType] = useState<PoolType>('situation_book')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [name, setName] = useState(retake ? `Retake: ${retake.sourceName}` : 'Situation Book Plan')
  const [daysPerWeek, setDaysPerWeek] = useState<number>(retake ? RETAKE_PLAN_DEFAULTS.daysPerWeek : 7)
  const [paceMode, setPaceMode] = useState<'end_date' | 'daily_count'>(retake ? 'daily_count' : 'end_date')
  const [targetEndDate, setTargetEndDate] = useState(defaultEndDate())
  const [questionsPerDay, setQuestionsPerDay] = useState<number>(RETAKE_PLAN_DEFAULTS.questionsPerDay)
  const [poolSize, setPoolSize] = useState<number | null>(retake ? retake.missedCount : null)
  const [poolSizeLoading, setPoolSizeLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function leaveRetake() {
    setRetakeActive(false)
    setName('Situation Book Plan')
    setDaysPerWeek(7)
    setPaceMode('end_date')
    setPoolType('situation_book')
    setPoolSize(null)
  }

  function selectPoolType(type: PoolType) {
    setPoolType(type)
    if (type === 'situation_book') setName('Situation Book Plan')
    else if (type === 'weak_areas') setName('Weaknesses Plan')
    else setName('Custom Plan')
  }

  function toggleCategory(category: string) {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    )
  }

  useEffect(() => {
    // A retake pool is already counted on the server; there's nothing to look up.
    if (retakeActive) return
    if (poolType === 'categories' && selectedCategories.length === 0) {
      setPoolSize(null)
      return
    }

    let cancelled = false
    setPoolSizeLoading(true)

    fetch('/api/quiz/paths/pool-size', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poolFilter: poolFilterFor(poolType, selectedCategories) }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setPoolSize(typeof data.poolSize === 'number' ? data.poolSize : null)
      })
      .catch(() => {
        if (!cancelled) setPoolSize(null)
      })
      .finally(() => {
        if (!cancelled) setPoolSizeLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [poolType, selectedCategories, retakeActive])

  const timeZone = resolveTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)

  const questionsPerDayPreview =
    paceMode === 'end_date' && poolSize && poolSize > 0 && targetEndDate
      ? computeQuestionsPerDay(poolSize, calendarDay(new Date(), timeZone), new Date(targetEndDate), daysPerWeek)
      : null

  // The same arithmetic the server uses when it saves the plan from a daily amount.
  const finishPreview =
    paceMode === 'daily_count' && poolSize && poolSize > 0
      ? {
          date: computeTargetEndDate(poolSize, questionsPerDay, calendarDay(new Date(), timeZone), daysPerWeek),
          studyDays: Math.ceil(poolSize / Math.max(1, questionsPerDay)),
        }
      : null

  async function createPlan() {
    setError(null)
    if (!retakeActive && poolType === 'categories' && selectedCategories.length === 0) {
      setError('Choose at least one category.')
      return
    }

    setLoading(true)

    const poolFilter: PathPoolFilter =
      retakeActive && retake
        ? { type: 'missed_questions', sourcePathId: retake.sourcePathId }
        : poolFilterFor(poolType, selectedCategories)

    const pace = paceMode === 'end_date' ? { targetEndDate } : { questionsPerDay }

    const response = await fetch('/api/quiz/paths', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, poolFilter, daysPerWeek, pace }),
    })

    const data = await response.json()
    if (!response.ok) {
      setError(data.error ?? 'Could not create this plan.')
      setLoading(false)
      return
    }

    router.push(`/paths/${data.pathId}`)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create a Study Plan</h1>
        <p className="text-gray-500 text-sm mt-1">Pick what to cover and how fast you want to get through it.</p>
      </div>

      {retakeActive && retake ? (
        <div className="space-y-3">
          <Label>What should this plan cover?</Label>
          <div className="rounded-lg border-2 border-slate-900 bg-slate-50 p-4">
            <p className="font-semibold text-gray-900">Questions you missed</p>
            <p className="text-sm text-gray-500 mt-0.5">
              {retake.missedCount} question{retake.missedCount === 1 ? '' : 's'} from {retake.sourceName} where your most recent answer was wrong.
            </p>
          </div>
          <button type="button" onClick={leaveRetake} className="text-sm text-gray-500 underline underline-offset-4">
            Choose something else instead
          </button>
        </div>
      ) : (
      <div className="space-y-3">
        <Label>What should this plan cover?</Label>
        <div className="grid gap-3">
          {POOL_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              onClick={() => selectPoolType(opt.type)}
              className={`text-left w-full rounded-lg border-2 p-4 transition-all ${
                poolType === opt.type ? 'border-slate-900 bg-slate-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="font-semibold text-gray-900">{opt.label}</p>
              <p className="text-sm text-gray-500 mt-0.5">{opt.description}</p>
            </button>
          ))}
        </div>

        {poolType === 'categories' && (
          <Card>
            <CardContent className="max-h-64 overflow-y-auto pt-4 space-y-1.5">
              {CATEGORIES.map((category) => (
                <label key={category} className="flex items-center gap-2 text-sm py-0.5">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(category)}
                    onChange={() => toggleCategory(category)}
                    className="rounded border-gray-300"
                  />
                  {category}
                </label>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="plan-name">Plan name</Label>
        <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-3">
        <Label>Study Plan Frequency</Label>
        <Tabs value={paceMode} onValueChange={(v) => setPaceMode(v as 'end_date' | 'daily_count')}>
          <TabsList>
            <TabsTrigger value="end_date">Pick a finish date</TabsTrigger>
            <TabsTrigger value="daily_count">Pick a daily amount</TabsTrigger>
          </TabsList>
          <TabsContent value="end_date" className="pt-3">
            <Input type="date" value={targetEndDate} onChange={(e) => setTargetEndDate(e.target.value)} />
          </TabsContent>
          <TabsContent value="daily_count" className="pt-3">
            <Input
              type="number"
              min={1}
              value={questionsPerDay}
              onChange={(e) => setQuestionsPerDay(Math.max(1, Number(e.target.value) || 1))}
            />
            <p className="text-xs text-gray-400 mt-1">We&apos;ll figure out your finish date from this pace.</p>
          </TabsContent>
        </Tabs>

        <div className="space-y-2 pt-1">
          <Label htmlFor="days-per-week">Days per week you&apos;ll study</Label>
          <Input
            id="days-per-week"
            type="number"
            min={1}
            max={7}
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(Math.min(7, Math.max(1, Number(e.target.value) || 1)))}
          />
        </div>

        {finishPreview && (
          <p className="text-sm text-gray-600 pt-1">
            At this pace you&apos;ll finish on <span className="font-semibold text-gray-900">{formatFinishDate(finishPreview.date)}</span>{' '}
            ({finishPreview.studyDays} study day{finishPreview.studyDays === 1 ? '' : 's'}).
          </p>
        )}

        {paceMode === 'end_date' && (
          <p className="text-sm text-gray-600 pt-1">
            {poolSizeLoading ? (
              'Calculating your daily pace…'
            ) : questionsPerDayPreview !== null ? (
              <>Number of questions per study day: <span className="font-semibold text-gray-900">{questionsPerDayPreview}</span></>
            ) : poolSize === 0 ? (
              'No questions currently match this plan yet.'
            ) : (
              'Choose what this plan covers to see your daily pace.'
            )}
          </p>
        )}
      </div>

      <p className="text-sm text-gray-500">Your plan starts today.</p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button onClick={createPlan} disabled={loading} className="w-full" size="lg">
        {loading ? 'Creating your plan…' : 'Create Plan'}
      </Button>
    </div>
  )
}
