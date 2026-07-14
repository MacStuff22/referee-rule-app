'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { SessionLength } from '@/types'

const SESSION_OPTIONS: { length: SessionLength; label: string; description: string; count: string }[] = [
  { length: 'quick', label: 'Quick', description: 'Fast warm-up session', count: '5–10 questions' },
  { length: 'standard', label: 'Standard', description: 'Balanced study session', count: '15–20 questions' },
  { length: 'full', label: 'Full', description: 'Deep dive into the rules', count: '30+ questions' },
]

export default function QuizStartPage() {
  const [selected, setSelected] = useState<SessionLength | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function startQuiz() {
    if (!selected) return
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Fetch questions weighted by weakness (low % correct categories weighted higher)
    const response = await fetch('/api/quiz/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionLength: selected }),
    })

    const { sessionId } = await response.json()
    router.push(`/quiz/${sessionId}`)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Take a Quiz</h1>
        <p className="text-gray-500 text-sm mt-1">Choose a session length to get started.</p>
      </div>

      <div className="grid gap-4">
        {SESSION_OPTIONS.map((opt) => (
          <button
            key={opt.length}
            onClick={() => setSelected(opt.length)}
            className={`text-left w-full rounded-lg border-2 p-5 transition-all ${
              selected === opt.length
                ? 'border-slate-900 bg-slate-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{opt.label}</p>
                <p className="text-sm text-gray-500 mt-0.5">{opt.description}</p>
              </div>
              <span className="text-sm font-medium text-gray-700 bg-gray-100 px-3 py-1 rounded-full">
                {opt.count}
              </span>
            </div>
          </button>
        ))}
      </div>

      <Button
        onClick={startQuiz}
        disabled={!selected || loading}
        className="w-full"
        size="lg"
      >
        {loading ? 'Building your quiz…' : 'Start Quiz'}
      </Button>
    </div>
  )
}
