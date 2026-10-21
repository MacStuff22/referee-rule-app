import { describe, it, expect } from 'vitest'
import { isAtUrl } from '@/lib/navigation'

describe('isAtUrl', () => {
  it('matches the same path', () => {
    expect(isAtUrl('/admin/questions', '/admin/questions')).toBe(true)
  })
  it('ignores query strings and hashes on the target', () => {
    expect(isAtUrl('/admin/questions', '/admin/questions?status=pending&sort=new')).toBe(true)
    expect(isAtUrl('/admin/questions', '/admin/questions#top')).toBe(true)
  })
  it('ignores trailing slashes', () => {
    expect(isAtUrl('/admin/questions/', '/admin/questions')).toBe(true)
  })
  it('does not match a different page', () => {
    expect(isAtUrl('/admin/questions/new', '/admin/questions')).toBe(false)
    expect(isAtUrl('/admin/questions/abc', '/admin/questions/def')).toBe(false)
  })
  it('handles the root path', () => {
    expect(isAtUrl('/', '/')).toBe(true)
    expect(isAtUrl('/admin', '/')).toBe(false)
  })
})
