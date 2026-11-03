import { describe, it, expect } from 'vitest'
import {
  analyticsAnchorId,
  analyticsHref,
  buildUserRows,
  countUsers,
  filterUsers,
  formatFullDate,
  formatRecency,
  formatShortDate,
  getUserStatus,
  parseShowFilter,
  summarizeUsers,
  type AuthUserFacts,
  type UserRow,
} from '@/lib/adminUsers'

const NOW = new Date('2026-11-02T12:00:00Z')

const joined: AuthUserFacts = {
  id: 'u1',
  invited_at: '2026-10-01T10:00:00Z',
  email_confirmed_at: '2026-10-02T10:00:00Z',
  last_sign_in_at: '2026-11-01T10:00:00Z',
}

describe('getUserStatus', () => {
  it('is active for someone who has joined and signed in', () => {
    expect(getUserStatus(joined, NOW)).toBe('active')
  })

  it('is pending for someone invited who never confirmed or signed in', () => {
    expect(getUserStatus({ id: 'u2', invited_at: '2026-10-28T10:00:00Z' }, NOW)).toBe('pending')
    expect(getUserStatus({ id: 'u2', invited_at: '2026-10-28T10:00:00Z', email_confirmed_at: null, last_sign_in_at: null }, NOW)).toBe('pending')
  })

  it('stops being pending as soon as the email is confirmed or they have signed in', () => {
    expect(getUserStatus({ id: 'u3', invited_at: '2026-10-28T10:00:00Z', email_confirmed_at: '2026-10-29T10:00:00Z' }, NOW)).toBe('active')
    expect(getUserStatus({ id: 'u3', invited_at: '2026-10-28T10:00:00Z', confirmed_at: '2026-10-29T10:00:00Z' }, NOW)).toBe('active')
    expect(getUserStatus({ id: 'u3', invited_at: '2026-10-28T10:00:00Z', last_sign_in_at: '2026-10-29T10:00:00Z' }, NOW)).toBe('active')
  })

  it('does not call an account pending when it was never invited (for example one made by a script)', () => {
    expect(getUserStatus({ id: 'u4' }, NOW)).toBe('active')
  })

  it('is deactivated while a ban has not run out, even for a pending invite', () => {
    expect(getUserStatus({ ...joined, banned_until: '2126-01-01T00:00:00Z' }, NOW)).toBe('deactivated')
    expect(getUserStatus({ id: 'u5', invited_at: '2026-10-28T10:00:00Z', banned_until: '2126-01-01T00:00:00Z' }, NOW)).toBe('deactivated')
  })

  it('ignores a ban that has expired or a date it cannot read', () => {
    expect(getUserStatus({ ...joined, banned_until: '2026-01-01T00:00:00Z' }, NOW)).toBe('active')
    expect(getUserStatus({ ...joined, banned_until: 'not a date' }, NOW)).toBe('active')
    expect(getUserStatus({ ...joined, banned_until: null }, NOW)).toBe('active')
  })

  it('is active when there is no sign-in record at all', () => {
    expect(getUserStatus(undefined, NOW)).toBe('active')
  })
})

describe('formatShortDate', () => {
  it('leaves the year off for this year and adds it for any other year', () => {
    expect(formatShortDate('2026-10-28T12:00:00Z', 'UTC', NOW)).toBe('Oct 28')
    expect(formatShortDate('2024-12-31T12:00:00Z', 'UTC', NOW)).toBe('Dec 31, 2024')
  })

  it("uses the viewer's time zone, so a late-evening invite is not a day ahead", () => {
    const iso = '2026-10-29T02:30:00Z'
    expect(formatShortDate(iso, 'UTC', NOW)).toBe('Oct 29')
    expect(formatShortDate(iso, 'America/Toronto', NOW)).toBe('Oct 28')
  })

  it('returns an empty string for a date it cannot read', () => {
    expect(formatShortDate('nonsense', 'UTC', NOW)).toBe('')
  })
})

describe('formatFullDate', () => {
  it('gives the date and time in the right zone, or nothing for junk', () => {
    expect(formatFullDate('2026-11-01T15:00:00Z', 'UTC')).toMatch(/^Nov 1, 2026, 3:00\sPM$/)
    expect(formatFullDate('2026-11-01T15:00:00Z', 'America/Toronto')).toMatch(/^Nov 1, 2026, 10:00\sAM$/)
    expect(formatFullDate('nonsense', 'UTC')).toBe('')
  })
})

describe('formatRecency', () => {
  it('counts whole calendar days', () => {
    expect(formatRecency('2026-11-02T03:00:00Z', 'UTC', NOW)).toBe('Today')
    expect(formatRecency('2026-11-01T20:00:00Z', 'UTC', NOW)).toBe('Yesterday')
    expect(formatRecency('2026-10-30T12:00:00Z', 'UTC', NOW)).toBe('3 days ago')
  })

  it('moves to weeks, then to a plain date from about a month on', () => {
    expect(formatRecency('2026-10-26T12:00:00Z', 'UTC', NOW)).toBe('1 week ago')
    expect(formatRecency('2026-10-12T12:00:00Z', 'UTC', NOW)).toBe('3 weeks ago')
    expect(formatRecency('2026-09-20T12:00:00Z', 'UTC', NOW)).toBe('Sep 20')
    expect(formatRecency('2025-06-01T12:00:00Z', 'UTC', NOW)).toBe('Jun 1, 2025')
  })

  it("measures days on the viewer's own clock", () => {
    // 3 AM UTC on Nov 2 is still the evening of Nov 1 in Toronto, and "now" is Nov 2 morning there.
    expect(formatRecency('2026-11-02T03:00:00Z', 'UTC', NOW)).toBe('Today')
    expect(formatRecency('2026-11-02T03:00:00Z', 'America/Toronto', NOW)).toBe('Yesterday')
  })

  it('never says a future time is in the past, and ignores junk', () => {
    expect(formatRecency('2026-11-03T12:00:00Z', 'UTC', NOW)).toBe('Today')
    expect(formatRecency('nonsense', 'UTC', NOW)).toBe('')
  })
})

const profiles = [
  { id: 'u1', email: 'jane@example.com', full_name: 'Jane Smith', role: 'admin' as const },
  { id: 'u2', email: 'alex@example.com', full_name: '', role: 'user' as const },
  { id: 'u3', email: 'orphan@example.com', full_name: 'No Auth Record', role: 'user' as const },
]

describe('buildUserRows', () => {
  const authUsers: AuthUserFacts[] = [
    joined,
    { id: 'u2', invited_at: '2026-11-02T11:59:00Z' },
    { id: 'someone-without-a-profile', last_sign_in_at: '2026-11-01T10:00:00Z' },
  ]

  it('keeps the profile order and merges status and date words by id', () => {
    const rows = buildUserRows(profiles, authUsers, NOW, 'UTC')
    expect(rows.map((r) => r.id)).toEqual(['u1', 'u2', 'u3'])
    expect(rows[0]).toEqual({
      id: 'u1',
      name: 'Jane Smith',
      email: 'jane@example.com',
      role: 'admin',
      status: 'active',
      invitedAt: '2026-10-01T10:00:00Z',
      lastSignInAt: '2026-11-01T10:00:00Z',
      invitedLabel: 'Oct 1',
      lastSignInLabel: 'Yesterday',
      lastSignInTitle: expect.stringMatching(/^Nov 1, 2026, 10:00\sAM$/),
      isNew: false,
    })
    expect(rows[1]).toMatchObject({
      name: '',
      status: 'pending',
      invitedLabel: 'Nov 2',
      lastSignInAt: null,
      lastSignInLabel: null,
      lastSignInTitle: null,
    })
  })

  it('marks only a pending invite from the last couple of minutes as new', () => {
    expect(buildUserRows(profiles, authUsers, NOW, 'UTC')[1].isNew).toBe(true)
    const later = new Date('2026-11-02T12:30:00Z')
    expect(buildUserRows(profiles, authUsers, later, 'UTC')[1].isNew).toBe(false)
    expect(buildUserRows(profiles, authUsers, NOW, 'UTC')[0].isNew).toBe(false)
  })

  it('treats a profile with no sign-in record as active with no dates, and drops sign-in records with no profile', () => {
    const rows = buildUserRows(profiles, authUsers, NOW, 'UTC')
    expect(rows[2]).toMatchObject({ status: 'active', invitedAt: null, invitedLabel: null, lastSignInLabel: null, isNew: false })
    expect(rows.some((r) => r.id === 'someone-without-a-profile')).toBe(false)
  })
})

describe('search, filters and summary', () => {
  const rows: UserRow[] = buildUserRows(
    [
      { id: 'a', email: 'jane@example.com', full_name: 'Jane Smith', role: 'admin' },
      { id: 'b', email: 'alex@example.com', full_name: 'Alex Roy', role: 'user' },
      { id: 'c', email: 'sam@example.com', full_name: 'Sam Lee', role: 'user' },
      { id: 'd', email: 'pat@example.com', full_name: 'Pat Jones', role: 'admin' },
    ],
    [
      { id: 'a', invited_at: '2026-10-01T10:00:00Z', email_confirmed_at: '2026-10-02T10:00:00Z' },
      { id: 'b', invited_at: '2026-10-28T10:00:00Z' },
      { id: 'c', invited_at: '2026-10-01T10:00:00Z', last_sign_in_at: '2026-10-02T10:00:00Z', banned_until: '2126-01-01T00:00:00Z' },
      { id: 'd', invited_at: '2026-10-01T10:00:00Z', last_sign_in_at: '2026-10-02T10:00:00Z' },
    ],
    NOW,
    'UTC'
  )
  const ids = (list: UserRow[]) => list.map((r) => r.id)

  it('reads the ?show= value, falling back to all', () => {
    expect(parseShowFilter('pending')).toBe('pending')
    expect(parseShowFilter('admins')).toBe('admins')
    for (const bad of [null, undefined, '', 'everyone', 'PENDING']) expect(parseShowFilter(bad)).toBe('all')
  })

  it('filters by group', () => {
    expect(ids(filterUsers(rows, '', 'all'))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(filterUsers(rows, '', 'admins'))).toEqual(['a', 'd'])
    expect(ids(filterUsers(rows, '', 'pending'))).toEqual(['b'])
    expect(ids(filterUsers(rows, '', 'deactivated'))).toEqual(['c'])
  })

  it('searches name and email, ignoring case and surrounding spaces', () => {
    expect(ids(filterUsers(rows, '  JANE ', 'all'))).toEqual(['a'])
    expect(ids(filterUsers(rows, 'example.com', 'all'))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(filterUsers(rows, 'zzz', 'all'))).toEqual([])
  })

  it('combines search with a group', () => {
    expect(ids(filterUsers(rows, 'j', 'admins'))).toEqual(['a', 'd'])
    expect(ids(filterUsers(rows, 'sam', 'admins'))).toEqual([])
  })

  it('counts each group within the current search', () => {
    expect(countUsers(rows, '')).toEqual({ all: 4, admins: 2, pending: 1, deactivated: 1 })
    expect(countUsers(rows, 'jane')).toEqual({ all: 1, admins: 1, pending: 0, deactivated: 0 })
  })

  it('sums the list up in one quiet sentence, leaving out groups that are empty', () => {
    expect(summarizeUsers(rows)).toBe('4 people: 2 admins, 1 pending invite, 1 deactivated.')
    expect(summarizeUsers(rows.filter((r) => r.id === 'a'))).toBe('1 person: 1 admin.')
    expect(summarizeUsers(rows.filter((r) => ['a', 'b', 'd'].includes(r.id)))).toBe('3 people: 2 admins, 1 pending invite.')
    expect(summarizeUsers([])).toBe('No one has been invited yet.')
  })
})

describe('Analytics link', () => {
  it('points at the card whose id the Analytics page uses', () => {
    expect(analyticsAnchorId('abc-123')).toBe('user-abc-123')
    expect(analyticsHref('abc-123')).toBe('/admin/analytics#user-abc-123')
  })
})
