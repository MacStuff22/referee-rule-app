// Sends JSON to one of our own API routes and always hands back a plain result:
// it never throws, so a button waiting on it can't be left stuck on "busy".

export const GENERIC_ERROR = 'Something went wrong. Please try again.'
export const NETWORK_ERROR = 'Couldn’t reach the server. Check your connection and try again.'

export type PostResult =
  | { ok: true }
  /** `status` is null when the request never got an answer (offline, dropped connection). */
  | { ok: false; status: number | null; message: string }

export async function postJson(url: string, body: Record<string, string>): Promise<PostResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) return { ok: true }
    // An error page instead of JSON is still an error: fall back to the generic sentence.
    const data = await res.json().catch(() => null)
    return { ok: false, status: res.status, message: typeof data?.error === 'string' ? data.error : GENERIC_ERROR }
  } catch {
    return { ok: false, status: null, message: NETWORK_ERROR }
  }
}
