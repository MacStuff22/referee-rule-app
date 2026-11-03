import { HISTORY_LIMIT, type AuditLine } from '@/lib/adminAudit'

// Who changed whose role or status, and when. Null lines means the history
// couldn't be loaded, which is not the same as "no changes yet".
export default function RecentChanges({ lines }: { lines: AuditLine[] | null }) {
  return (
    <section aria-labelledby="recent-changes-heading" className="space-y-2">
      <h2 id="recent-changes-heading" className="text-sm font-medium text-foreground">
        Recent changes
      </h2>
      {lines === null ? (
        <p className="text-sm text-muted-foreground">Couldn’t load recent changes.</p>
      ) : lines.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No changes yet. Role and status changes will be listed here.
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          {lines.map((line) => (
            <li key={line.id} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm">
              <span className="min-w-0 text-foreground">{line.text}</span>
              <time dateTime={line.createdAt} title={line.whenTitle} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {line.when}
              </time>
            </li>
          ))}
        </ul>
      )}
      {/* The page asks for the latest 10; say so when the list is full, so a missing older change isn't read as "never happened". */}
      {lines !== null && lines.length >= HISTORY_LIMIT && (
        <p className="text-xs text-muted-foreground">Showing the {HISTORY_LIMIT} most recent changes.</p>
      )}
    </section>
  )
}
