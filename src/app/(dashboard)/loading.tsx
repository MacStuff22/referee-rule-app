// Route-transition fallback for the dashboard segment (dashboard, quiz start,
// rules, results). Shows a light skeleton so navigation feels instant.

export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded bg-gray-200" />
          <div className="h-4 w-40 rounded bg-gray-100" />
        </div>
        <div className="h-10 w-28 rounded-lg bg-gray-200" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="h-4 w-32 rounded bg-gray-200" />
            <div className="h-2 w-full rounded bg-gray-100" />
            <div className="h-3 w-24 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  )
}
