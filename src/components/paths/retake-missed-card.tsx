'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

/** Starts a quiz of the questions the user is still getting wrong, a few at a time. */
export function RetakeMissedCard({
  pathId,
  missedCount,
  sizeOptions,
  defaultSize,
  bestAfter,
  primary,
}: {
  pathId: string
  missedCount: number
  /** The quiz sizes on offer, smallest first. A single entry means there is nothing to choose. */
  sizeOptions: number[]
  defaultSize: number
  /** A short date, e.g. "Nov 2", when waiting a few days is still worth suggesting. Null otherwise. */
  bestAfter: string | null
  primary: boolean
}) {
  const router = useRouter()
  const [index, setIndex] = useState(Math.max(0, sizeOptions.indexOf(defaultSize)))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const size = sizeOptions[index] ?? defaultSize

  async function start() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/quiz/paths/${pathId}/retake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: size }),
      })
      const body = await res.json()
      if (!res.ok || !body.sessionId) throw new Error(body.error ?? 'Could not start the quiz')
      router.push(`/quiz/${body.sessionId}`)
    } catch {
      setError('Could not build your quiz. Try again.')
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div>
        <p className="font-medium text-gray-900">Retake what you missed</p>
        <p className="text-sm text-gray-500">
          {missedCount} question{missedCount === 1 ? '' : 's'} where your last answer was wrong. Seeing them again is the
          fastest way to lock them in.
        </p>
      </div>

      {sizeOptions.length > 1 && (
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>Quiz size</span>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Fewer questions"
            disabled={loading || index === 0}
            onClick={() => setIndex((i) => i - 1)}
          >
            −
          </Button>
          <span className="w-6 text-center font-medium text-gray-900" aria-live="polite">{size}</span>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="More questions"
            disabled={loading || index === sizeOptions.length - 1}
            onClick={() => setIndex((i) => i + 1)}
          >
            +
          </Button>
        </div>
      )}

      {bestAfter && (
        <p className="text-xs text-gray-500">
          Waiting a few days helps it stick. Best after {bestAfter} — or start now.
        </p>
      )}

      <Button onClick={start} disabled={loading} size="lg" variant={primary ? 'default' : 'outline'} className="w-full">
        {loading ? 'Building your quiz…' : `Retake ${size} question${size === 1 ? '' : 's'}`}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
