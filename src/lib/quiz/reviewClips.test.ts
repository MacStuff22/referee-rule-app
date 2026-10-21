import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getReviewClipUrls } from '@/lib/quiz/reviewClips'

const PATH_A = 'questions/00000000-0000-4000-8000-00000000000a.mp4'
const PATH_B = 'questions/00000000-0000-4000-8000-00000000000b.mp4'

type Row = { id: string; video_path: string }

function fakeSupabase(result: { data: Row[] | null; error: unknown } | (() => never)) {
  const inFn = vi.fn(async () => (typeof result === 'function' ? result() : result))
  const select = vi.fn(() => ({ in: inFn }))
  const from = vi.fn(() => ({ select }))
  return { client: { from } as unknown as import('@supabase/supabase-js').SupabaseClient, from, inFn }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('getReviewClipUrls', () => {
  it('returns an empty map without touching the database when there are no ids', async () => {
    const { client, from } = fakeSupabase({ data: [], error: null })
    expect((await getReviewClipUrls(client, [])).size).toBe(0)
    expect(from).not.toHaveBeenCalled()
  })

  it('degrades to no clips when the query fails, e.g. the video column does not exist yet', async () => {
    const sign = vi.fn()
    const { client } = fakeSupabase({
      data: null,
      error: { code: '42703', message: 'column questions.video_path does not exist' },
    })
    const result = await getReviewClipUrls(client, ['q1'], { signUrls: sign })
    expect(result.size).toBe(0)
    expect(sign).not.toHaveBeenCalled()
  })

  it('never throws when the query itself throws', async () => {
    const { client } = fakeSupabase(() => {
      throw new Error('network down')
    })
    await expect(getReviewClipUrls(client, ['q1'])).resolves.toEqual(new Map())
  })

  it('maps question ids to signed urls, ignoring questions without a valid clip', async () => {
    const { client } = fakeSupabase({
      data: [
        { id: 'q1', video_path: PATH_A },
        { id: 'q2', video_path: '' },
        { id: 'q3', video_path: '../../etc/passwd' },
        { id: 'q4', video_path: PATH_B },
      ],
      error: null,
    })
    const sign = vi.fn(async (paths: string[]) => paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}` })))
    const result = await getReviewClipUrls(client, ['q1', 'q2', 'q3', 'q4'], { signUrls: sign })
    expect(result).toEqual(new Map([['q1', `https://signed/${PATH_A}`], ['q4', `https://signed/${PATH_B}`]]))
    expect(sign).toHaveBeenCalledWith([PATH_A, PATH_B])
  })

  it('signs a clip shared by two questions once and gives both the url', async () => {
    const { client } = fakeSupabase({
      data: [{ id: 'q1', video_path: PATH_A }, { id: 'q2', video_path: PATH_A }],
      error: null,
    })
    const sign = vi.fn(async (paths: string[]) => paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}` })))
    const result = await getReviewClipUrls(client, ['q1', 'q2', 'q1'], { signUrls: sign })
    expect(sign).toHaveBeenCalledWith([PATH_A])
    expect(result.size).toBe(2)
  })

  it('keeps the clips that signed and skips the ones that did not', async () => {
    const { client } = fakeSupabase({
      data: [{ id: 'q1', video_path: PATH_A }, { id: 'q2', video_path: PATH_B }],
      error: null,
    })
    const sign = vi.fn(async () => [
      { path: PATH_A, signedUrl: 'https://signed/a' },
      { path: PATH_B, signedUrl: null },
    ])
    expect(await getReviewClipUrls(client, ['q1', 'q2'], { signUrls: sign })).toEqual(new Map([['q1', 'https://signed/a']]))
  })

  it('never throws when signing fails', async () => {
    const { client } = fakeSupabase({ data: [{ id: 'q1', video_path: PATH_A }], error: null })
    const sign = vi.fn(async () => {
      throw new Error('storage outage')
    })
    await expect(getReviewClipUrls(client, ['q1'], { signUrls: sign })).resolves.toEqual(new Map())
  })

  it('gives up on a hanging sign call instead of stalling the page', async () => {
    const { client } = fakeSupabase({ data: [{ id: 'q1', video_path: PATH_A }], error: null })
    const sign = vi.fn(() => new Promise<never>(() => {}))
    const started = Date.now()
    const result = await getReviewClipUrls(client, ['q1'], { signUrls: sign, timeoutMs: 30 })
    expect(result.size).toBe(0)
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
