// ============================================================
// Turns rows of admin_audit_log (written whenever an admin changes someone's
// role or deactivates / reactivates them) into one plain sentence each, for the
// "Recent changes" list on the Users tab. Pure, so it can be tested without a
// database. Dates are worded here, on the server, in the viewer's time zone.
// ============================================================

import { formatFullDate, formatShortDate } from '@/lib/adminUsers'
import type { Profile } from '@/types'

/** How many of the latest changes the Users page asks for and shows. */
export const HISTORY_LIMIT = 10

/** A row of admin_audit_log as the database returns it. */
export interface AuditEntry {
  id: string
  actor_id: string | null
  target_user_id: string | null
  action: string
  details: unknown
  created_at: string
}

export interface AuditLine {
  id: string
  text: string
  /** "Oct 28, 3:42 PM" */
  when: string
  /** "Oct 28, 2026, 3:42 PM", for the hover text */
  whenTitle: string
  /** For the <time> element. */
  createdAt: string
}

type Person = Pick<Profile, 'id' | 'full_name' | 'email'>

function detailsOf(entry: AuditEntry): Record<string, unknown> {
  return entry.details && typeof entry.details === 'object' && !Array.isArray(entry.details)
    ? (entry.details as Record<string, unknown>)
    : {}
}

function formatWhen(iso: string, timeZone: string, now: Date): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(date)
  return `${formatShortDate(iso, timeZone, now)}, ${time}`
}

/**
 * One line per entry, in the order given. "You" and "you" stand in for the
 * signed-in admin. An account that has since been removed is still named as
 * "a removed account" rather than leaving a hole in the sentence.
 */
export function buildAuditLines(
  entries: AuditEntry[],
  people: Person[],
  currentUserId: string | null,
  timeZone: string,
  now: Date
): AuditLine[] {
  const nameById = new Map(people.map((p) => [p.id, p.full_name || p.email]))

  return entries.map((entry) => {
    const actor =
      entry.actor_id !== null && entry.actor_id === currentUserId
        ? 'You'
        : (entry.actor_id && nameById.get(entry.actor_id)) || 'Someone'
    const target =
      entry.target_user_id !== null && entry.target_user_id === currentUserId
        ? 'you'
        : (entry.target_user_id && nameById.get(entry.target_user_id)) || 'a removed account'

    const details = detailsOf(entry)
    let text: string
    if (entry.action === 'role_change') {
      if (details.to === 'admin') text = `${actor} made ${target} an admin`
      else if (details.to === 'user') text = `${actor} removed admin access for ${target}`
      else text = `${actor} changed the role of ${target}`
    } else if (entry.action === 'status_change') {
      if (details.action === 'deactivate') text = `${actor} deactivated ${target}`
      else if (details.action === 'reactivate') text = `${actor} reactivated ${target}`
      else text = `${actor} changed the status of ${target}`
    } else {
      text = `${actor} updated ${target}`
    }

    return {
      id: entry.id,
      text,
      when: formatWhen(entry.created_at, timeZone, now),
      whenTitle: formatFullDate(entry.created_at, timeZone),
      createdAt: entry.created_at,
    }
  })
}
