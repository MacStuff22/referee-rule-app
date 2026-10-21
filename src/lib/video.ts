// ============================================================
// Video question helpers — shared by the admin form, the signed-URL API
// route and the quiz player. Pure functions only, so they're unit testable.
// ============================================================

export const VIDEO_BUCKET = 'question-videos'

export const DEFAULT_VIDEO_PLAYS = 2
export const MIN_VIDEO_PLAYS = 1
export const MAX_VIDEO_PLAYS = 5

/** Non-blocking admin warnings. */
export const VIDEO_WARN_BYTES = 15 * 1024 * 1024
export const VIDEO_WARN_SECONDS = 60

/** Matches the bucket's file_size_limit — anything larger would be rejected by storage anyway. */
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024

/** How long a signed clip URL stays valid (long enough to finish a quiz question, short enough not to be shareable). */
export const VIDEO_SIGNED_URL_SECONDS = 60 * 60

/** Coerces anything (DB value, form input) to a whole play count in range. */
export function clampPlays(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_VIDEO_PLAYS
  return Math.min(MAX_VIDEO_PLAYS, Math.max(MIN_VIDEO_PLAYS, Math.round(n)))
}

/**
 * Builds the row written to `questions` on save. The video columns only exist
 * once supabase-migration-video.sql has been run, and PostgREST rejects a write
 * that names an unknown column — so they are included ONLY when the question
 * has, had, or is getting a clip. Saving or approving an ordinary question must
 * never depend on the video schema.
 */
export function buildQuestionDbPayload<T extends Record<string, unknown>>(
  payload: T,
  video: { active: boolean; hadSaved: boolean; path: string; plays: number }
): T & { video_path?: string; video_plays?: number } {
  if (!video.active && !video.hadSaved) return payload
  return {
    ...payload,
    video_path: video.active ? video.path : '',
    video_plays: video.active ? clampPlays(video.plays) : DEFAULT_VIDEO_PLAYS,
  }
}

export function buildVideoPath(id: string): string {
  return `questions/${id}.mp4`
}

const VIDEO_PATH_PATTERN = /^questions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/i

/** Guards against ever signing an arbitrary storage path taken from a database row. */
export function isValidVideoPath(path: unknown): path is string {
  return typeof path === 'string' && VIDEO_PATH_PATTERN.test(path)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** A reason the file can't be used at all, or null if it's acceptable. */
export function videoFileProblem(file: { name: string; type: string; size: number }): string | null {
  const isMp4 = file.type === 'video/mp4' || /\.mp4$/i.test(file.name)
  if (!isMp4) {
    return 'Clips must be MP4 (H.264). Convert it with HandBrake ("Fast 720p30", Web Optimized) and try again.'
  }
  if (file.size > VIDEO_MAX_BYTES) {
    return `This file is ${formatBytes(file.size)} — the limit is ${formatBytes(VIDEO_MAX_BYTES)}. Compress it (720p, 30 fps) and try again.`
  }
  return null
}

/** Non-blocking warnings about a usable file. `durationSeconds` is null until the browser has read the metadata. */
export function videoFileWarnings(sizeBytes: number, durationSeconds: number | null): string[] {
  const warnings: string[] = []
  if (sizeBytes > VIDEO_WARN_BYTES) {
    warnings.push(
      `This file is ${formatBytes(sizeBytes)}. Large clips use up your free storage and download allowance quickly — consider compressing it (about 3–6 MB for 30 seconds is typical).`
    )
  }
  if (durationSeconds !== null && durationSeconds > VIDEO_WARN_SECONDS) {
    warnings.push(`This clip is ${Math.round(durationSeconds)} seconds long. Clips are meant to be under a minute.`)
  }
  return warnings
}
