// Shown for unmatched routes and anywhere the app calls notFound()
// (e.g. editing a question id that no longer exists).

import { LinkButton } from '@/components/ui/link-button'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md text-center space-y-4">
        <div className="text-4xl">🏒</div>
        <h1 className="text-xl font-bold text-gray-900">Page not found</h1>
        <p className="text-sm text-gray-500">
          We couldn’t find what you were looking for. It may have been moved or removed.
        </p>
        <div className="pt-1">
          <LinkButton href="/dashboard">Back to Dashboard</LinkButton>
        </div>
      </div>
    </div>
  )
}
