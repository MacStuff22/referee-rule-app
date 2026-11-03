'use client'

import { useId, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import UserRowActions from '@/components/admin/user-row-actions'
import UserStatusBadge from '@/components/admin/user-status-badge'
import {
  SHOW_FILTERS,
  countUsers,
  filterUsers,
  parseShowFilter,
  type ShowFilter,
  type UserRow,
} from '@/lib/adminUsers'
import { cn } from '@/lib/utils'

const HEADER_CELL = 'h-9 px-4 text-xs font-normal text-muted-foreground'

interface UsersClientProps {
  rows: UserRow[]
  currentUserId: string | null
}

// The search box, the filter chips and the table. Everything is already on the
// page (it is a short list), so searching and filtering happen right here with
// no trip to the server.
export default function UsersClient({ rows, currentUserId }: UsersClientProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const headingId = useId()

  // Start from the address, so a refresh or a shared link shows the same view.
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  const [show, setShow] = useState<ShowFilter>(() => parseShowFilter(searchParams.get('show')))

  const counts = countUsers(rows, query)
  const totals = countUsers(rows, '')
  const visible = filterUsers(rows, query, show)
  const filtering = query.trim() !== '' || show !== 'all'

  // Keeps the address in step with the view. Plain history.replaceState rather
  // than router.replace: Next treats replaceState as a client-side update, where
  // router.replace would re-run the server page (two Supabase calls) per keystroke.
  function writeUrl(nextQuery: string, nextShow: ShowFilter) {
    const params = new URLSearchParams(window.location.search)
    if (nextQuery) params.set('q', nextQuery)
    else params.delete('q')
    if (nextShow !== 'all') params.set('show', nextShow)
    else params.delete('show')
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname)
  }

  function changeQuery(next: string) {
    setQuery(next)
    writeUrl(next, show)
  }

  function changeShow(next: ShowFilter) {
    setShow(next)
    writeUrl(query, next)
  }

  function clearFilters() {
    setQuery('')
    setShow('all')
    writeUrl('', 'all')
  }

  // Groups nobody is in don't get a chip (a "Deactivated 0" button is clutter), unless it is the one selected.
  const chips = SHOW_FILTERS.filter(({ key }) => key === 'all' || totals[key] > 0 || show === key)

  return (
    <section className="space-y-3" aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">
        People
      </h2>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            name="q"
            aria-label="Search people"
            placeholder="Search name or email…"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            className="pl-8 pointer-coarse:h-10"
          />
        </div>
        <div role="group" aria-label="Show" className="flex flex-wrap items-center gap-1.5">
          {chips.map(({ key, label }) => {
            const active = show === key
            return (
              <Button
                key={key}
                size="sm"
                variant={active ? 'default' : 'outline'}
                aria-pressed={active}
                className="pointer-coarse:h-9"
                onClick={() => changeShow(key)}
              >
                {label}
                <span className={cn('tabular-nums', active ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                  {counts[key]}
                </span>
              </Button>
            )
          })}
          {filtering && (
            <Button size="sm" variant="ghost" className="pointer-coarse:h-9" onClick={clearFilters}>
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Tells screen readers how many people the search and chips left. */}
      <p role="status" className="sr-only">
        {filtering ? `${visible.length} of ${rows.length} people shown.` : ''}
      </p>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {visible.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? (
              <p>No one has been invited yet. Choose Invite Someone to add the first person.</p>
            ) : (
              <div className="space-y-3">
                <p>No one matches {query.trim() ? `“${query.trim()}”` : 'this filter'}.</p>
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        ) : (
          <Table aria-labelledby={headingId}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={HEADER_CELL}>Person</TableHead>
                <TableHead className={cn(HEADER_CELL, 'hidden sm:table-cell')}>Role</TableHead>
                <TableHead className={cn(HEADER_CELL, 'hidden sm:table-cell')}>Status</TableHead>
                <TableHead className={cn(HEADER_CELL, 'hidden sm:table-cell')}>Last sign-in</TableHead>
                <TableHead className={HEADER_CELL}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <UserTableRow key={row.id} row={row} isSelf={row.id === currentUserId} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  )
}

function UserTableRow({ row, isSelf }: { row: UserRow; isSelf: boolean }) {
  // With no name on file, the email is the person's name.
  const display = row.name || row.email
  const roleLabel = row.role === 'admin' ? 'Admin' : 'User'
  const lastSignIn =
    row.lastSignInAt && row.lastSignInLabel ? (
      <time dateTime={row.lastSignInAt} title={row.lastSignInTitle ?? undefined}>
        {row.lastSignInLabel}
      </time>
    ) : null

  return (
    <TableRow className={row.isNew ? 'row-flash' : undefined}>
      {/* max-w-0 plus truncate lets a long email shorten instead of widening the table. */}
      <TableCell className="w-full max-w-0 px-4 py-3 sm:w-2/5">
        <p className="truncate font-medium text-foreground" title={display}>
          {display}
          {isSelf && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(You)</span>}
        </p>
        {row.name && (
          <p className="truncate text-muted-foreground" title={row.email}>
            {row.email}
          </p>
        )}
        {/* Small screens fold the Role, Status and Last sign-in columns into this cell. */}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:hidden">
          <span className={row.role === 'admin' ? 'font-medium text-foreground' : undefined}>{roleLabel}</span>
          <UserStatusBadge status={row.status} />
          {row.status === 'pending' && row.invitedLabel ? (
            <span>Invited {row.invitedLabel}</span>
          ) : (
            lastSignIn && <span>Signed in {lastSignIn}</span>
          )}
        </div>
      </TableCell>

      <TableCell className="hidden px-4 py-3 sm:table-cell">
        <span className={row.role === 'admin' ? 'font-medium text-foreground' : 'text-muted-foreground'}>{roleLabel}</span>
      </TableCell>

      <TableCell className="hidden px-4 py-3 sm:table-cell">
        {row.status === 'active' ? (
          <span className="sr-only">Active</span>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <UserStatusBadge status={row.status} />
            {row.status === 'pending' && row.invitedLabel && (
              <span className="text-xs text-muted-foreground">Invited {row.invitedLabel}</span>
            )}
          </div>
        )}
      </TableCell>

      <TableCell className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
        {lastSignIn ?? (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Never</span>
          </>
        )}
      </TableCell>

      <TableCell className="px-4 py-3 text-right">
        {!isSelf && <UserRowActions userId={row.id} name={row.name} email={row.email} role={row.role} status={row.status} />}
      </TableCell>
    </TableRow>
  )
}
