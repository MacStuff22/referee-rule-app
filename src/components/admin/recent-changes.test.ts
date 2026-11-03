import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import RecentChanges from '@/components/admin/recent-changes'
import type { AuditLine } from '@/lib/adminAudit'

const lines: AuditLine[] = [
  { id: 'a', text: 'You made Jane Smith an admin', when: 'Oct 28, 7:42 PM', whenTitle: 'Oct 28, 2026, 7:42 PM', createdAt: '2026-10-28T19:42:00Z' },
  { id: 'b', text: 'Pat Jones deactivated Sam Lee', when: 'Oct 27, 9:05 AM', whenTitle: 'Oct 27, 2026, 9:05 AM', createdAt: '2026-10-27T09:05:00Z' },
]

const render = (value: AuditLine[] | null) => renderToStaticMarkup(createElement(RecentChanges, { lines: value }))

describe('RecentChanges', () => {
  it('lists each change with its time, under a heading', () => {
    const html = render(lines)
    expect(html).toContain('>Recent changes</h2>')
    expect(html.match(/<li/g)).toHaveLength(2)
    expect(html).toContain('You made Jane Smith an admin')
    expect(html).toContain('<time dateTime="2026-10-28T19:42:00Z" title="Oct 28, 2026, 7:42 PM"')
    expect(html).toContain('Oct 28, 7:42 PM')
  })

  it('says it is showing only the latest ones once the list is full, and not before', () => {
    const full = Array.from({ length: 10 }, (_, i) => ({ ...lines[0], id: `row-${i}` }))
    expect(render(full)).toContain('Showing the 10 most recent changes.')
    expect(render(lines)).not.toContain('most recent changes')
  })

  it('keeps its frame and says so when there is nothing yet', () => {
    const html = render([])
    expect(html).toContain('>Recent changes</h2>')
    expect(html).toContain('No changes yet.')
    expect(html).not.toContain('<ul')
  })

  it('says it could not load, rather than claiming there are no changes', () => {
    const html = render(null)
    expect(html).toContain('Couldn’t load recent changes.')
    expect(html).not.toContain('No changes yet')
  })
})
