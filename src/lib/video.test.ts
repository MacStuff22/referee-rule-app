import { describe, it, expect } from 'vitest'
import {
  clampPlays,
  buildVideoPath,
  isValidVideoPath,
  videoFileProblem,
  videoFileWarnings,
  VIDEO_MAX_BYTES,
  VIDEO_WARN_BYTES,
} from '@/lib/video'

describe('clampPlays', () => {
  it('defaults to 2 for junk input', () => {
    expect(clampPlays(undefined)).toBe(2)
    expect(clampPlays('abc')).toBe(2)
    expect(clampPlays(NaN)).toBe(2)
  })
  it('keeps values in the 1-5 range', () => {
    expect(clampPlays(0)).toBe(1)
    expect(clampPlays(-3)).toBe(1)
    expect(clampPlays(3)).toBe(3)
    expect(clampPlays(99)).toBe(5)
  })
  it('rounds and accepts numeric strings', () => {
    expect(clampPlays('3')).toBe(3)
    expect(clampPlays(2.6)).toBe(3)
  })
})

describe('video paths', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000'
  it('builds a path that validates', () => {
    expect(isValidVideoPath(buildVideoPath(id))).toBe(true)
  })
  it('rejects empty, traversal and foreign paths', () => {
    expect(isValidVideoPath('')).toBe(false)
    expect(isValidVideoPath(null)).toBe(false)
    expect(isValidVideoPath('../secret.mp4')).toBe(false)
    expect(isValidVideoPath('questions/../x.mp4')).toBe(false)
    expect(isValidVideoPath(`other/${id}.mp4`)).toBe(false)
    expect(isValidVideoPath(`questions/${id}.mov`)).toBe(false)
  })
})

describe('videoFileProblem', () => {
  it('accepts a normal mp4', () => {
    expect(videoFileProblem({ name: 'clip.mp4', type: 'video/mp4', size: 5_000_000 })).toBeNull()
  })
  it('accepts an mp4 whose browser type is blank', () => {
    expect(videoFileProblem({ name: 'clip.MP4', type: '', size: 5_000_000 })).toBeNull()
  })
  it('rejects non-mp4 files', () => {
    expect(videoFileProblem({ name: 'clip.mov', type: 'video/quicktime', size: 5_000_000 })).toMatch(/MP4/)
  })
  it('rejects files over the storage limit', () => {
    expect(videoFileProblem({ name: 'clip.mp4', type: 'video/mp4', size: VIDEO_MAX_BYTES + 1 })).toMatch(/limit/)
  })
})

describe('videoFileWarnings', () => {
  it('is quiet for a small short clip', () => {
    expect(videoFileWarnings(5_000_000, 30)).toEqual([])
  })
  it('warns about large files', () => {
    expect(videoFileWarnings(VIDEO_WARN_BYTES + 1, 30)).toHaveLength(1)
  })
  it('warns about long clips only once duration is known', () => {
    expect(videoFileWarnings(5_000_000, null)).toEqual([])
    expect(videoFileWarnings(5_000_000, 75)).toHaveLength(1)
  })
  it('can raise both warnings', () => {
    expect(videoFileWarnings(VIDEO_WARN_BYTES + 1, 75)).toHaveLength(2)
  })
})
