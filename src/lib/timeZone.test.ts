import { describe, it, expect } from 'vitest'
import { DEFAULT_PLAN_TIME_ZONE, isValidTimeZone, resolveTimeZone } from '@/lib/timeZone'

describe('isValidTimeZone', () => {
  it('accepts real IANA zones and rejects junk', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone(undefined)).toBe(false)
    expect(isValidTimeZone(42)).toBe(false)
    expect(isValidTimeZone('A'.repeat(200))).toBe(false)
  })
})

describe('resolveTimeZone', () => {
  it('uses a valid zone, including the URL-encoded cookie form', () => {
    expect(resolveTimeZone('America/Los_Angeles')).toBe('America/Los_Angeles')
    expect(resolveTimeZone('America%2FChicago')).toBe('America/Chicago')
  })
  it('falls back to Eastern for anything missing or invalid, never throwing', () => {
    for (const bad of [undefined, null, '', 'nonsense', '%E0%A4%A', 'Mars/Olympus']) {
      expect(resolveTimeZone(bad)).toBe(DEFAULT_PLAN_TIME_ZONE)
    }
  })
})
