import { cookies } from 'next/headers'
import { PLAN_TIME_ZONE_COOKIE, resolveTimeZone } from '@/lib/timeZone'

/** The viewer's time zone for this request (server components and route handlers). */
export async function getRequestTimeZone(): Promise<string> {
  const store = await cookies()
  return resolveTimeZone(store.get(PLAN_TIME_ZONE_COOKIE)?.value)
}
