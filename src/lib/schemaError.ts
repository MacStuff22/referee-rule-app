// ============================================================
// Recognising "the database doesn't have this yet" errors.
//
// Schema changes are applied by hand in the Supabase SQL Editor, so code can
// briefly (or, as with the video migration, for days) run against a database
// that lacks a column, table, function or storage bucket it expects. These
// helpers tell that situation apart from a genuine failure so optional
// features can degrade quietly and admins get an instruction instead of a
// cryptic PostgREST message.
// ============================================================

const SCHEMA_MISSING_CODES = new Set([
  '42703', // undefined_column
  '42P01', // undefined_table
  '42883', // undefined_function
  'PGRST200', // relationship not found in schema cache
  'PGRST204', // column not found in schema cache
  'PGRST205', // table not found in schema cache
])

const SCHEMA_MISSING_MESSAGES = [
  /schema cache/i,
  /column .* does not exist/i,
  /could not find the .* column/i,
  /relation .* does not exist/i,
  /bucket not found/i,
  /row-level security/i,
]

export interface ErrorLike {
  code?: string | null
  message?: string | null
  statusCode?: string | number | null
}

function asErrorLike(e: unknown): ErrorLike {
  return e && typeof e === 'object' ? (e as ErrorLike) : {}
}

/** True when `e` looks like a missing column/table/function/bucket or storage policy rather than a real failure. */
export function isSchemaMissingError(e: unknown): boolean {
  const { code, message } = asErrorLike(e)
  if (code && SCHEMA_MISSING_CODES.has(code)) return true
  return typeof message === 'string' && SCHEMA_MISSING_MESSAGES.some((re) => re.test(message))
}

export const VIDEO_MIGRATION_HINT =
  'Video questions need a database update first — run supabase-migration-video.sql in the Supabase SQL Editor, then try again.'

/** The message to show an admin when a save fails. A missing-schema failure on a video save becomes an instruction. */
export function describeSaveError(e: unknown, opts: { hasVideo: boolean }): string {
  if (opts.hasVideo && isSchemaMissingError(e)) return VIDEO_MIGRATION_HINT
  const { message } = asErrorLike(e)
  return typeof message === 'string' && message ? message : 'Something went wrong while saving.'
}
