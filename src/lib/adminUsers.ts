// ============================================================
// Logic behind the admin Users tab: whether a person is pending, active or
// deactivated, and how a date reads in their row. Pure functions, so they can
// be tested without a Supabase connection.
// ============================================================

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

/** One row per profile (the profile list sets the order), with status and dates from the matching auth user. */
export function buildUserRows(
  profiles: Pick<Profile, 'id' | 'email' | 'full_name' | 'role'>[],
  authUsers: AuthUserFacts[],
  now: Date
): UserRow[] {
  const authById = new Map(authUsers.map((user) => [user.id, user]))
  return profiles.map((profile) => {
    const auth = authById.get(profile.id)
    return {
      id: profile.id,
      name: profile.full_name,
      email: profile.email,
      role: profile.role,
      status: getUserStatus(auth, now),
      invitedAt: auth?.invited_at ?? null,
      lastSignInAt: auth?.last_sign_in_at ?? null,
    }
  })
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
