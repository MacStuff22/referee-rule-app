// Renders the Users list to HTML on the server (no browser needed) and checks what
// it contains. The logic behind it is tested in lib/adminUsers.test.ts; this checks
// that the pieces are wired into the page the way they should be.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildUserRows } from '@/lib/adminUsers'

const nav = vi.hoisted(() => ({ search: '' }))

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/users',
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ refresh: () => {} }),
}))

import UsersClient from '@/components/admin/users-client'

const NOW = new Date('2026-11-02T12:00:00Z')

const rows = buildUserRows(
  [
    { id: 'jane', email: 'jane@example.com', full_name: 'Jane Smith', role: 'admin' },
    { id: 'alex', email: 'alex@example.com', full_name: 'Alex Roy', role: 'user' },
    { id: 'sam', email: 'sam@example.com', full_name: 'Sam Lee', role: 'user' },
    { id: 'noname', email: 'noname@example.com', full_name: '', role: 'user' },
  ],
  [
    { id: 'jane', invited_at: '2026-10-01T10:00:00Z', email_confirmed_at: '2026-10-02T10:00:00Z', last_sign_in_at: '2026-11-02T09:00:00Z' },
    { id: 'alex', invited_at: '2026-10-28T10:00:00Z' },
    { id: 'sam', invited_at: '2026-10-01T10:00:00Z', last_sign_in_at: '2026-10-30T10:00:00Z', banned_until: '2126-01-01T00:00:00Z' },
    { id: 'noname', invited_at: '2026-10-01T10:00:00Z', last_sign_in_at: '2026-10-02T10:00:00Z' },
  ],
  NOW,
  'UTC'
)

function render(search = '', list = rows) {
  nav.search = search
  return renderToStaticMarkup(createElement(UsersClient, { rows: list, currentUserId: 'jane' }))
}

describe('UsersClient', () => {
  beforeEach(() => {
    nav.search = ''
  })

  it('is a real table with column headings and one row per person', () => {
    const html = render()
    expect(html).toContain('<table')
    for (const heading of ['Person', 'Role', 'Status', 'Last sign-in']) expect(html).toContain(`>${heading}</th>`)
    expect(html.split('<tbody')[1].match(/<tr[ >]/g)).toHaveLength(4)
  })

  it('says pending and deactivated in words, with the invite date, and shows when someone last signed in', () => {
    const html = render()
    expect(html).toContain('Pending invite')
    expect(html).toContain('Deactivated')
    expect(html).toContain('Invited Oct 28')
    expect(html).toContain('Today')
    expect(html).toContain('3 days ago')
  })

  it('names each person on their menu button, and gives your own row no actions and a (You) tag', () => {
    const html = render()
    expect(html).toContain('aria-label="Actions for Alex Roy"')
    expect(html).toContain('aria-label="Actions for Sam Lee"')
    expect(html).not.toContain('Actions for Jane Smith')
    expect(html).toContain('(You)')
  })

  it('uses the email as the name when there is no name, and offers Resend only on pending rows', () => {
    const html = render()
    expect(html).toContain('aria-label="Actions for noname@example.com"')
    expect(html.match(/Resend Invitation/g)).toHaveLength(1)
  })

  it('shows chips with counts, and leaves out a group nobody is in', () => {
    const html = render()
    expect(html).toContain('aria-label="Show"')
    expect(html).toMatch(/aria-pressed="true"[^>]*>All<span[^>]*>4<\/span>/)
    expect(html).toMatch(/>Admins<span[^>]*>1<\/span>/)
    expect(html).toMatch(/>Pending<span[^>]*>1<\/span>/)
    expect(html).toMatch(/>Deactivated<span[^>]*>1<\/span>/)

    const noPending = buildUserRows(
      [{ id: 'jane', email: 'jane@example.com', full_name: 'Jane Smith', role: 'admin' }],
      [{ id: 'jane', last_sign_in_at: '2026-11-02T09:00:00Z' }],
      NOW,
      'UTC'
    )
    const calm = render('', noPending)
    expect(calm).not.toContain('>Pending<')
    expect(calm).not.toContain('>Deactivated<')
  })

  it('starts from the address: ?show= picks a group and ?q= fills the search', () => {
    const pending = render('show=pending')
    expect(pending).toContain('Alex Roy')
    expect(pending).not.toContain('Sam Lee')
    expect(pending).toMatch(/aria-pressed="true"[^>]*>Pending</)
    expect(pending).toContain('1 of 4 people shown.')

    const searched = render('q=SAM')
    expect(searched).toContain('Sam Lee')
    expect(searched).not.toContain('Alex Roy')
    expect(searched).toContain('value="SAM"')
  })

  it('ignores a ?show= value it does not know', () => {
    const html = render('show=everyone')
    expect(html).toContain('Jane Smith')
    expect(html).toContain('Sam Lee')
  })

  it('says so, with a way out, when nothing matches', () => {
    const html = render('q=zzz')
    expect(html).not.toContain('<table')
    expect(html).toContain('No one matches “zzz”.')
    expect(html).toContain('Clear Filters')
  })

  it('invites the first person when the list is empty', () => {
    const html = render('', [])
    expect(html).toContain('No one has been invited yet.')
    expect(html).not.toContain('Clear Filters')
  })

  it('marks a just-invited pending person so the row can glow', () => {
    const fresh = buildUserRows(
      [{ id: 'new', email: 'new@example.com', full_name: 'New Person', role: 'user' }],
      [{ id: 'new', invited_at: '2026-11-02T11:59:30Z' }],
      NOW,
      'UTC'
    )
    expect(render('', fresh)).toMatch(/<tr [^>]*class="[^"]*row-flash"/)
    expect(render()).not.toContain('row-flash')
  })
})
