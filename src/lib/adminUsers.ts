// ============================================================
// Logic behind the admin Users tab: whether a person is pending, active or
// deactivated, how dates read in their row, and how the list is searched,
// filtered and summed up. Pure functions, so they can be tested without a
// Supabase connection. Every date word is worked out on the server and sent as
// text, so the browser never re-formats it and can't disagree with the server.
// ============================================================

import { calendarDay } from '@/lib/quiz/paths'
import type { Profile, UserRole } from '@/types'

export type UserStatus = 'pending' | 'active' | 'deactivated'

/** The parts of a Supabase auth user that decide a person's status. The admin API leaves out any it doesn't have. */
export interface AuthUserFacts {
  id: string
  invited_at?: string | null
  email_confirmed_at?: string | null
  confirmed_at?: string | null
  last_sign_in_at?: string | null
  banned_until?: string | null
}

export interface UserRow {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  invitedAt: string | null
  lastSignInAt: string | null
  /** "Oct 28" */
  invitedLabel: string | null
  /** "3 days ago" */
  lastSignInLabel: string | null
  /** "Nov 1, 2026, 10:00 AM", for the hover text */
  lastSignInTitle: string | null
  /** Invited a moment ago, so the row can glow briefly to show where they landed. */
  isNew: boolean
}

function isInFuture(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false
  const time = new Date(iso).getTime()
  return Number.isFinite(time) && time > now.getTime()
}

/**
 * Deactivated (a ban that hasn't run out) wins over everything. Pending means
 * invited, but the person has never confirmed their email or signed in. Anything
 * else is active, including a person we have no sign-in facts for: only flag what
 * we can show.
 */
export function getUserStatus(facts: AuthUserFacts | undefined, now: Date): UserStatus {
  if (!facts) return 'active'
  if (isInFuture(facts.banned_until, now)) return 'deactivated'
  const hasJoined = Boolean(facts.email_confirmed_at || facts.confirmed_at || facts.last_sign_in_at)
  return facts.invited_at && !hasJoined ? 'pending' : 'active'
}

/**
 * "Oct 28", or "Oct 28, 2025" when it isn't this year, in the viewer's time zone.
 * The server runs on UTC, so a bare toLocaleDateString() could be a day off.
 */
export function formatShortDate(iso: string, timeZone: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const yearOf = (d: Date) => new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(d)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(yearOf(date) === yearOf(now) ? {} : { year: 'numeric' }),
    timeZone,
  }).format(date)
}

/** "Nov 1, 2026, 10:00 AM" in the viewer's time zone. */
export function formatFullDate(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date)
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * How long ago, in whole calendar days on the viewer's wall clock: "Today",
 * "Yesterday", "3 days ago", "2 weeks ago", then a plain date from about a month on.
 */
export function formatRecency(iso: string, timeZone: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const days = Math.round((calendarDay(now, timeZone).getTime() - calendarDay(date, timeZone).getTime()) / MS_PER_DAY)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
  }
  return formatShortDate(iso, timeZone, now)
}

const NEW_INVITE_WINDOW_MS = 2 * 60 * 1000
const CLOCK_SKEW_MS = 60 * 1000

/** One row per profile (the profile list sets the order), with status and date words from the matching auth user. */
export function buildUserRows(
  profiles: Pick<Profile, 'id' | 'email' | 'full_name' | 'role'>[],
  authUsers: AuthUserFacts[],
  now: Date,
  timeZone: string
): UserRow[] {
  const authById = new Map(authUsers.map((user) => [user.id, user]))
  return profiles.map((profile) => {
    const auth = authById.get(profile.id)
    const status = getUserStatus(auth, now)
    const invitedAt = auth?.invited_at ?? null
    const lastSignInAt = auth?.last_sign_in_at ?? null
    const invitedAge = invitedAt ? now.getTime() - new Date(invitedAt).getTime() : Number.NaN
    return {
      id: profile.id,
      name: profile.full_name,
      email: profile.email,
      role: profile.role,
      status,
      invitedAt,
      lastSignInAt,
      invitedLabel: invitedAt ? formatShortDate(invitedAt, timeZone, now) || null : null,
      lastSignInLabel: lastSignInAt ? formatRecency(lastSignInAt, timeZone, now) || null : null,
      lastSignInTitle: lastSignInAt ? formatFullDate(lastSignInAt, timeZone) || null : null,
      isNew: status === 'pending' && invitedAge > -CLOCK_SKEW_MS && invitedAge < NEW_INVITE_WINDOW_MS,
    }
  })
}

// ---- Search, filter and summary -------------------------------------------

export type ShowFilter = 'all' | 'admins' | 'pending' | 'deactivated'

export const SHOW_FILTERS: { key: ShowFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'admins', label: 'Admins' },
  { key: 'pending', label: 'Pending' },
  { key: 'deactivated', label: 'Deactivated' },
]

/** Reads ?show= from the address; anything unknown means "all". */
export function parseShowFilter(value: string | null | undefined): ShowFilter {
  return SHOW_FILTERS.some((f) => f.key === value) ? (value as ShowFilter) : 'all'
}

function matchesQuery(row: UserRow, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return row.name.toLowerCase().includes(needle) || row.email.toLowerCase().includes(needle)
}

function matchesShow(row: UserRow, show: ShowFilter): boolean {
  if (show === 'admins') return row.role === 'admin'
  if (show === 'pending') return row.status === 'pending'
  if (show === 'deactivated') return row.status === 'deactivated'
  return true
}

export function filterUsers(rows: UserRow[], query: string, show: ShowFilter): UserRow[] {
  return rows.filter((row) => matchesQuery(row, query) && matchesShow(row, show))
}

/** How many people each chip would show for the current search, so the numbers on the chips follow what you typed. */
export function countUsers(rows: UserRow[], query: string): Record<ShowFilter, number> {
  const searched = rows.filter((row) => matchesQuery(row, query))
  return {
    all: searched.length,
    admins: searched.filter((row) => matchesShow(row, 'admins')).length,
    pending: searched.filter((row) => matchesShow(row, 'pending')).length,
    deactivated: searched.filter((row) => matchesShow(row, 'deactivated')).length,
  }
}

/** The quiet line under the page title, e.g. "14 people: 2 admins, 1 pending invite, 1 deactivated." */
export function summarizeUsers(rows: UserRow[]): string {
  if (rows.length === 0) return 'No one has been invited yet.'
  const counts = countUsers(rows, '')
  const parts = [`${counts.admins} ${counts.admins === 1 ? 'admin' : 'admins'}`]
  if (counts.pending) parts.push(`${counts.pending} pending ${counts.pending === 1 ? 'invite' : 'invites'}`)
  if (counts.deactivated) parts.push(`${counts.deactivated} deactivated`)
  return `${rows.length} ${rows.length === 1 ? 'person' : 'people'}: ${parts.join(', ')}.`
}
