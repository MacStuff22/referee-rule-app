// Route-transition fallback for every admin tab: a page title, then a card of
// rows. Moving between tabs shows this at once instead of leaving the old page
// frozen while the server loads. Flat grey bars at roughly real sizes, and the
// pulse switches off for anyone who prefers less motion.

export default function Loading() {
  return (
    <div role="status" className="space-y-6 motion-safe:animate-pulse">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-40 rounded bg-gray-200" aria-hidden="true" />
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4" aria-hidden="true">
        <div className="h-5 w-48 rounded bg-gray-200" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="h-4 w-44 rounded bg-gray-200" />
              <div className="h-3 w-56 rounded bg-gray-100" />
            </div>
            <div className="h-7 w-24 rounded-lg bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  )
}
