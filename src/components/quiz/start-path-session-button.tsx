'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function StartPathSessionButton({ pathId, questionsPerDay }: { pathId: string; questionsPerDay: number }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function start() {
    setLoading(true)
    setError(null)
    const response = await fetch(`/api/quiz/paths/${pathId}/start`, { method: 'POST' })
    const data = await response.json()

    if (!response.ok) {
      setError(data.error ?? 'Could not start today\'s questions.')
      setLoading(false)
      return
    }

    if (data.completed) {
      router.refresh()
      return
    }

    router.push(`/quiz/${data.sessionId}`)
  }

  return (
    <div className="space-y-2">
      <Button onClick={start} disabled={loading} size="lg" className="w-full">
        {loading ? 'Building today\'s questions…' : `Do Today's ${questionsPerDay} Questions`}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
