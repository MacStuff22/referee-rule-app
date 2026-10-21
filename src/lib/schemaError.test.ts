import { describe, it, expect } from 'vitest'
import { isSchemaMissingError, describeSaveError, VIDEO_MIGRATION_HINT } from '@/lib/schemaError'

describe('isSchemaMissingError', () => {
  it('recognises the error codes a missing column, table or function produces', () => {
    for (const code of ['42703', '42P01', '42883', 'PGRST200', 'PGRST204', 'PGRST205']) {
      expect(isSchemaMissingError({ code, message: 'x' })).toBe(true)
    }
  })

  it('recognises the real messages seen when the video migration was missing', () => {
    expect(isSchemaMissingError({ message: 'column questions.video_path does not exist' })).toBe(true)
    expect(isSchemaMissingError({ message: "Could not find the 'video_path' column of 'questions' in the schema cache" })).toBe(true)
    expect(isSchemaMissingError({ message: "Could not find the table 'public.question_admin_notes' in the schema cache" })).toBe(true)
    expect(isSchemaMissingError({ message: 'Bucket not found' })).toBe(true)
    expect(isSchemaMissingError({ message: 'new row violates row-level security policy' })).toBe(true)
  })

  it('does not treat ordinary failures as a missing schema', () => {
    expect(isSchemaMissingError({ code: '23505', message: 'duplicate key value' })).toBe(false)
    expect(isSchemaMissingError({ message: 'Failed to fetch' })).toBe(false)
    expect(isSchemaMissingError(null)).toBe(false)
    expect(isSchemaMissingError(undefined)).toBe(false)
    expect(isSchemaMissingError('boom')).toBe(false)
  })
})

describe('describeSaveError', () => {
  const missing = { code: 'PGRST204', message: "Could not find the 'video_path' column" }

  it('turns a missing-schema failure on a video save into an instruction', () => {
    expect(describeSaveError(missing, { hasVideo: true })).toBe(VIDEO_MIGRATION_HINT)
  })

  it('passes the real message through for a non-video save or an unrelated error', () => {
    expect(describeSaveError(missing, { hasVideo: false })).toBe(missing.message)
    expect(describeSaveError({ message: 'duplicate key value' }, { hasVideo: true })).toBe('duplicate key value')
  })

  it('has a fallback when there is no message', () => {
    expect(describeSaveError({}, { hasVideo: false })).toBe('Something went wrong while saving.')
  })
})
