// ============================================================
// Review-page clip URLs — strictly best effort.
//
// Clips are an optional extra on the results page. Resolving them must never
// be able to break that page: a missing video migration, a missing service
// key, a Storage outage or a slow signing call all just mean "no clips".
// This is why it runs as its own query instead of adding video_path to the
// page's core quiz_answers join (which is what took the whole page down when
// the video schema had not been applied yet).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { VIDEO_BUCKET, VIDEO_SIGNED_URL_SECONDS, isValidVideoPath } from '@/lib/video'

export const REVIEW_CLIP_TIMEOUT_MS = 3000

export interface SignedUrlResult {
  path: string | null
  signedUrl: string | null
}

export interface ReviewClipDeps {
  signUrls?: (paths: string[]) => Promise<SignedUrlResult[]>
  timeoutMs?: number
}

async function signWithAdminClient(paths: string[]): Promise<SignedUrlResult[]> {
  // Created here (not at module load) so a missing service key is caught by the
  // caller's try/catch instead of crashing the page.
  const { data, error } = await createAdminClient().storage.from(VIDEO_BUCKET).createSignedUrls(paths, VIDEO_SIGNED_URL_SECONDS)
  if (error) throw error
  return data ?? []
}

function describe(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: string; message?: string }
    return [e.code, e.message].filter(Boolean).join(' ') || 'unknown error'
  }
  return String(err)
}

/** Maps question id -> short-lived signed URL for every answered question that has a clip. Never throws. */
export async function getReviewClipUrls(
  supabase: SupabaseClient,
  questionIds: string[],
  deps: ReviewClipDeps = {}
): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  const ids = [...new Set(questionIds)]
  if (ids.length === 0) return found

  const sign = deps.signUrls ?? signWithAdminClient
  const timeoutMs = deps.timeoutMs ?? REVIEW_CLIP_TIMEOUT_MS

  const work = (async () => {
    const { data, error } = await supabase.from('questions').select('id, video_path').in('id', ids)
    if (error) {
      console.warn('Review clips unavailable:', describe(error))
      return
    }
    const clips = (data ?? []).filter((q) => isValidVideoPath(q.video_path))
    if (clips.length === 0) return

    const paths = [...new Set(clips.map((q) => q.video_path as string))]
    const signed = await sign(paths)
    const urlByPath = new Map<string, string>()
    for (const s of signed) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl)
    for (const q of clips) {
      const url = urlByPath.get(q.video_path as string)
      if (url) found.set(q.id as string, url)
    }
  })().catch((err) => {
    console.warn('Review clips unavailable:', describe(err))
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs)
  })
  await Promise.race([work, timeout])
  clearTimeout(timer)

  // Snapshot: if the timeout won, `work` may still finish later and must not mutate what we return.
  return new Map(found)
}
