'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

// Re-runs the server page. Stays busy until the fresh page has arrived.
export default function RetryButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <Button variant="outline" size="sm" disabled={isPending} onClick={() => startTransition(() => router.refresh())}>
      {isPending ? 'Retrying…' : 'Retry'}
    </Button>
  )
}
