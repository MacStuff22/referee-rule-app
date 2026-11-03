import { describe, it, expect } from 'vitest'
import { buildUserRows, formatShortDate, getUserStatus, type AuthUserFacts } from '@/lib/adminUsers'

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

describe('buildUserRows', () => {
  const profiles = [
    { id: 'u1', email: 'jane@example.com', full_name: 'Jane Smith', role: 'admin' as const },
    { id: 'u2', email: 'alex@example.com', full_name: '', role: 'user' as const },
    { id: 'u3', email: 'orphan@example.com', full_name: 'No Auth Record', role: 'user' as const },
  ]
  const authUsers: AuthUserFacts[] = [
    joined,
    { id: 'u2', invited_at: '2026-10-28T10:00:00Z' },
    { id: 'someone-without-a-profile', last_sign_in_at: '2026-11-01T10:00:00Z' },
  ]

  it('keeps the profile order and merges status and dates by id', () => {
    const rows = buildUserRows(profiles, authUsers, NOW)
    expect(rows.map((r) => r.id)).toEqual(['u1', 'u2', 'u3'])
    expect(rows[0]).toEqual({
      id: 'u1',
      name: 'Jane Smith',
      email: 'jane@example.com',
      role: 'admin',
      status: 'active',
      invitedAt: '2026-10-01T10:00:00Z',
      lastSignInAt: '2026-11-01T10:00:00Z',
    })
    expect(rows[1]).toMatchObject({ name: '', status: 'pending', invitedAt: '2026-10-28T10:00:00Z', lastSignInAt: null })
  })

  it('treats a profile with no sign-in record as active with no dates, and drops sign-in records with no profile', () => {
    const rows = buildUserRows(profiles, authUsers, NOW)
    expect(rows[2]).toMatchObject({ status: 'active', invitedAt: null, lastSignInAt: null })
    expect(rows.some((r) => r.id === 'someone-without-a-profile')).toBe(false)
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
