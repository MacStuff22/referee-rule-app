'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CATEGORIES } from '@/lib/constants'
import type { PathPoolFilter } from '@/types'

type PoolType = PathPoolFilter['type']

const POOL_OPTIONS: { type: PoolType; label: string; description: string }[] = [
  { type: 'situation_book', label: 'Situation Book', description: 'Every approved question tied to a Situation Handbook entry.' },
  { type: 'categories', label: 'Choose Categories', description: 'Pick specific rule-book categories to focus a plan on.' },
  { type: 'weak_areas', label: 'Auto Weak-Areas', description: "Built automatically from your current weakest categories." },
]

function defaultEndDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 90)
  return d.toISOString().slice(0, 10)
}

export default function NewPathPage() {
  const [poolType, setPoolType] = useState<PoolType>('situation_book')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [name, setName] = useState('Situation Book Plan')
  const [daysPerWeek, setDaysPerWeek] = useState(7)
  const [paceMode, setPaceMode] = useState<'end_date' | 'daily_count'>('end_date')
  const [targetEndDate, setTargetEndDate] = useState(defaultEndDate())
  const [questionsPerDay, setQuestionsPerDay] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function selectPoolType(type: PoolType) {
    setPoolType(type)
    if (type === 'situation_book') setName('Situation Book Plan')
    else if (type === 'weak_areas') setName('Weak Areas Plan')
    else setName('Custom Plan')
  }

  function toggleCategory(category: string) {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    )
  }

  async function createPlan() {
    setError(null)
    if (poolType === 'categories' && selectedCategories.length === 0) {
      setError('Choose at least one category.')
      return
    }

    setLoading(true)

    const poolFilter: PathPoolFilter =
      poolType === 'categories'
        ? { type: 'categories', categories: selectedCategories }
        : poolType === 'weak_areas'
          ? { type: 'weak_areas', categories: [] }
          : { type: 'situation_book' }

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

      <div className="space-y-2">
        <Label htmlFor="plan-name">Plan name</Label>
        <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-2">
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

      <div className="space-y-3">
        <Label>Pace</Label>
        <Tabs value={paceMode} onValueChange={(v) => setPaceMode(v as 'end_date' | 'daily_count')}>
          <TabsList>
            <TabsTrigger value="end_date">Pick a finish date</TabsTrigger>
            <TabsTrigger value="daily_count">Pick a daily amount</TabsTrigger>
          </TabsList>
          <TabsContent value="end_date" className="pt-3">
            <Input type="date" value={targetEndDate} onChange={(e) => setTargetEndDate(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">We&apos;ll figure out how many questions per day that takes.</p>
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
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button onClick={createPlan} disabled={loading} className="w-full" size="lg">
        {loading ? 'Creating your plan…' : 'Create Plan'}
      </Button>
    </div>
  )
}
