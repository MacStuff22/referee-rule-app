import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The results page once failed for every user because its core query asked for
// an optional-feature column (questions.video_path) before the migration that
// adds it had been run. Optional-feature data must be loaded separately and
// best-effort (see src/lib/quiz/reviewClips.ts), never added to this query.
const pageSource = readFileSync(
  fileURLToPath(new URL('../../app/(dashboard)/quiz/[sessionId]/results/page.tsx', import.meta.url)),
  'utf8'
)

describe('quiz results page', () => {
  it('does not select optional video columns in its core query', () => {
    const selects = pageSource.match(/\.select\((?:'[^']*'|"[^"]*"|`[^`]*`)\)/g) ?? []
    expect(selects.length).toBeGreaterThan(0)
    for (const call of selects) expect(call).not.toMatch(/video_/)
  })

  it('loads clips through the best-effort helper', () => {
    expect(pageSource).toContain('getReviewClipUrls')
    expect(pageSource).not.toContain('createAdminClient')
  })
})
