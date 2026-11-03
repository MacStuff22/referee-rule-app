import { describe, it, expect } from 'vitest'
import { buildAuditLines, type AuditEntry } from '@/lib/adminAudit'

const NOW = new Date('2026-11-02T12:00:00Z')

const people = [
  { id: 'morgan', full_name: 'Morgan MacPhee', email: 'morgan@example.com' },
  { id: 'jane', full_name: 'Jane Smith', email: 'jane@example.com' },
  { id: 'noname', full_name: '', email: 'noname@example.com' },
]

function entry(partial: Partial<AuditEntry> & Pick<AuditEntry, 'action'>): AuditEntry {
  return {
    id: 'e1',
    actor_id: 'morgan',
    target_user_id: 'jane',
    details: {},
    created_at: '2026-10-28T19:42:00Z',
    ...partial,
  }
}

const text = (e: AuditEntry, me: string | null = null) => buildAuditLines([e], people, me, 'UTC', NOW)[0].text

describe('buildAuditLines wording', () => {
  it('describes a role change in either direction', () => {
    expect(text(entry({ action: 'role_change', details: { from: 'user', to: 'admin' } }))).toBe('Morgan MacPhee made Jane Smith an admin')
    expect(text(entry({ action: 'role_change', details: { from: 'admin', to: 'user' } }))).toBe('Morgan MacPhee removed admin access for Jane Smith')
  })

  it('describes deactivating and reactivating', () => {
    expect(text(entry({ action: 'status_change', details: { action: 'deactivate' } }))).toBe('Morgan MacPhee deactivated Jane Smith')
    expect(text(entry({ action: 'status_change', details: { action: 'reactivate' } }))).toBe('Morgan MacPhee reactivated Jane Smith')
  })

  it('still says something sensible for details or actions it does not know', () => {
    expect(text(entry({ action: 'role_change', details: { to: 'moderator' } }))).toBe('Morgan MacPhee changed the role of Jane Smith')
    expect(text(entry({ action: 'role_change', details: null }))).toBe('Morgan MacPhee changed the role of Jane Smith')
    expect(text(entry({ action: 'role_change', details: ['to', 'admin'] }))).toBe('Morgan MacPhee changed the role of Jane Smith')
    expect(text(entry({ action: 'status_change', details: 'weird' }))).toBe('Morgan MacPhee changed the status of Jane Smith')
    expect(text(entry({ action: 'something_new' }))).toBe('Morgan MacPhee updated Jane Smith')
  })

  it('uses the email when a person has no name', () => {
    expect(text(entry({ action: 'status_change', details: { action: 'deactivate' }, target_user_id: 'noname' }))).toBe(
      'Morgan MacPhee deactivated noname@example.com'
    )
  })

  it('says You and you for the signed-in admin', () => {
    const made = entry({ action: 'role_change', details: { to: 'admin' } })
    expect(text(made, 'morgan')).toBe('You made Jane Smith an admin')
    expect(text(made, 'jane')).toBe('Morgan MacPhee made you an admin')
    expect(text(made, 'someone-else')).toBe('Morgan MacPhee made Jane Smith an admin')
  })

  it('does not treat a missing person as the signed-in admin when nobody is signed in', () => {
    const removed = entry({ action: 'status_change', details: { action: 'deactivate' }, actor_id: null, target_user_id: null })
    expect(text(removed, null)).toBe('Someone deactivated a removed account')
  })

  it('names an actor or target who is no longer in the people list', () => {
    expect(text(entry({ action: 'role_change', details: { to: 'admin' }, actor_id: 'gone' }))).toBe('Someone made Jane Smith an admin')
    expect(text(entry({ action: 'role_change', details: { to: 'admin' }, target_user_id: 'gone' }))).toBe('Morgan MacPhee made a removed account an admin')
  })
})

describe('buildAuditLines dates and order', () => {
  it('words the time in the viewer’s zone, with the full date for hover', () => {
    const [line] = buildAuditLines([entry({ action: 'role_change', details: { to: 'admin' } })], people, null, 'UTC', NOW)
    expect(line.when).toMatch(/^Oct 28, 7:42\sPM$/)
    expect(line.whenTitle).toMatch(/^Oct 28, 2026, 7:42\sPM$/)
    expect(line.createdAt).toBe('2026-10-28T19:42:00Z')

    const [toronto] = buildAuditLines([entry({ action: 'role_change', details: { to: 'admin' } })], people, null, 'America/Toronto', NOW)
    expect(toronto.when).toMatch(/^Oct 28, 3:42\sPM$/)
  })

  it('adds the year for an older entry, and an empty date for one it cannot read', () => {
    const [old] = buildAuditLines([entry({ action: 'role_change', created_at: '2025-03-05T15:00:00Z' })], people, null, 'UTC', NOW)
    expect(old.when).toMatch(/^Mar 5, 2025, 3:00\sPM$/)
    const [bad] = buildAuditLines([entry({ action: 'role_change', created_at: 'nonsense' })], people, null, 'UTC', NOW)
    expect(bad.when).toBe('')
    expect(bad.whenTitle).toBe('')
  })

  it('keeps the order it was given and the id of each entry', () => {
    const lines = buildAuditLines(
      [entry({ id: 'first', action: 'role_change' }), entry({ id: 'second', action: 'status_change' })],
      people,
      null,
      'UTC',
      NOW
    )
    expect(lines.map((l) => l.id)).toEqual(['first', 'second'])
  })
})
