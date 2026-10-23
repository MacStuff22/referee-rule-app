// ============================================================
// Which time zone a "study day" is measured in.
//
// The server runs on UTC, but a study day should start at the viewer's own
// midnight. The browser reports its zone in a cookie (see
// components/layout/time-zone-cookie.tsx) and server code reads it back
// (lib/requestTimeZone.ts). Anything missing or invalid falls back to Eastern,
// so a first visit, blocked cookies or a bad value can never break a page.
// ============================================================

export const PLAN_TIME_ZONE_COOKIE = 'tz'
export const DEFAULT_PLAN_TIME_ZONE = 'America/New_York'

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length === 0 || timeZone.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/** A cookie or browser value -> a usable IANA zone, or the default. Accepts the URL-encoded form (America%2FChicago). */
export function resolveTimeZone(value: string | null | undefined): string {
  if (!value) return DEFAULT_PLAN_TIME_ZONE
  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return DEFAULT_PLAN_TIME_ZONE
  }
  return isValidTimeZone(decoded) ? decoded : DEFAULT_PLAN_TIME_ZONE
}
