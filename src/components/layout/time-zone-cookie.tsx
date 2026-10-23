'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PLAN_TIME_ZONE_COOKIE, isValidTimeZone } from '@/lib/timeZone'

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  if (!match) return null
  try {
    return decodeURIComponent(match.slice(name.length + 1))
  } catch {
    return null
  }
}

// Tells the server which time zone this browser is in, so a Study Plan's day
// starts at the user's own midnight (including when they travel). Renders nothing.
export function TimeZoneCookie() {
  const router = useRouter()

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!isValidTimeZone(detected) || readCookie(PLAN_TIME_ZONE_COOKIE) === detected) return
    document.cookie = `${PLAN_TIME_ZONE_COOKIE}=${encodeURIComponent(detected)}; path=/; max-age=31536000; SameSite=Lax`
    // Re-render the page the server already sent using the old zone, but only if the cookie really stuck.
    if (readCookie(PLAN_TIME_ZONE_COOKIE) === detected) router.refresh()
  }, [router])

  return null
}
