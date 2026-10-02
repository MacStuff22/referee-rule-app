import { describe, it, expect } from 'vitest'
import { CATEGORIES, HANDBOOK_SECTIONS, SECTION_CATEGORIES } from '@/lib/constants'

describe('SECTION_CATEGORIES', () => {
  it('lists every section', () => {
    expect(Object.keys(SECTION_CATEGORIES).sort()).toEqual([...HANDBOOK_SECTIONS].sort())
  })
  it('places every category in exactly one section', () => {
    const all = Object.values(SECTION_CATEGORIES).flat()
    expect(new Set(all).size).toBe(all.length)
    expect([...all].sort()).toEqual([...CATEGORIES].sort())
  })
})
