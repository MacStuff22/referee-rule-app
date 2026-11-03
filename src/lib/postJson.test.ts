import { afterEach, describe, it, expect, vi } from 'vitest'
import { GENERIC_ERROR, NETWORK_ERROR, postJson } from '@/lib/postJson'

afterEach(() => vi.unstubAllGlobals())

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('postJson', () => {
  it('posts the body as JSON and reports success', async () => {
    const fetchMock = stubFetch(async () => new Response('{"success":true}', { status: 200 }))
    await expect(postJson('/api/x', { a: '1' })).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":"1"}',
    })
  })

  it("passes along the server's own sentence and status", async () => {
    stubFetch(async () => new Response('{"error":"You can\'t demote yourself."}', { status: 400 }))
    await expect(postJson('/api/x', {})).resolves.toEqual({ ok: false, status: 400, message: "You can't demote yourself." })
  })

  it('falls back to the generic sentence when the reply is an error page or has no message', async () => {
    stubFetch(async () => new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(postJson('/api/x', {})).resolves.toEqual({ ok: false, status: 502, message: GENERIC_ERROR })
    stubFetch(async () => new Response('{"error":42}', { status: 500 }))
    await expect(postJson('/api/x', {})).resolves.toEqual({ ok: false, status: 500, message: GENERIC_ERROR })
  })

  it('never throws when the connection drops', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(postJson('/api/x', {})).resolves.toEqual({ ok: false, status: null, message: NETWORK_ERROR })
  })
})
