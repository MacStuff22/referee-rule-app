'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { SessionLength } from '@/types'

/** Starts a quiz limited to the given topics, then opens it. */
export function PracticeButton({
  categories,
  sessionLength = 'quick',
  variant = 'default',
  size = 'sm',
  fullWidth = false,
  children = 'Practice',
}: {
  categories: string[]
  sessionLength?: SessionLength
  variant?: 'default' | 'outline'
  size?: 'sm' | 'lg'
  fullWidth?: boolean
  children?: React.ReactNode
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  async function start() {
    setLoading(true)
    setFailed(false)
    try {
      const res = await fetch('/api/quiz/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionLength, categories }),
      })
      const body = await res.json()
      if (!res.ok || !body.sessionId) throw new Error(body.error ?? 'Could not start quiz')
      router.push(`/quiz/${body.sessionId}`)
    } catch {
      setFailed(true)
      setLoading(false)
    }
  }

  return (
    <span className={fullWidth ? 'flex flex-col gap-2' : 'inline-flex items-center gap-2'}>
      <Button size={size} variant={variant} onClick={start} disabled={loading} className={fullWidth ? 'w-full' : undefined}>
        {loading ? 'Starting…' : children}
      </Button>
      {failed && <span className="text-xs text-red-600">Couldn&apos;t start. Try again.</span>}
    </span>
  )
}
