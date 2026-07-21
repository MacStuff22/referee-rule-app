'use client'

// Route-segment error boundary. Catches unexpected errors thrown while
// rendering any page and shows a calm, recoverable message instead of a
// raw crash screen.

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface for debugging; wire to a real logger when one is added.
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md text-center space-y-4">
        <div className="text-4xl">🏒</div>
        <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
        <p className="text-sm text-gray-500">
          This page hit an unexpected snag. You can try again, or head back to your dashboard.
        </p>
        <div className="flex gap-3 justify-center pt-1">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => { window.location.href = '/dashboard' }}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}
