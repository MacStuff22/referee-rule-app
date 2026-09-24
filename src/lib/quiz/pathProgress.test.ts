import { describe, it, expect } from 'vitest'
import { getPathAnswers, getCoveredQuestionIds } from '@/lib/quiz/pathProgress'

function fakeSupabase(rows: { question_id: string; answered_at: string }[], error: { message: string } | null = null) {
  return {
    from(table: string) {
      if (table !== 'quiz_answers') throw new Error(`unexpected table ${table}`)
      const builder = {
        eq: () => builder,
        order: () => Promise.resolve({ data: rows, error }),
      }
      return { select: () => builder }
    },
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('getPathAnswers', () => {
  it('returns an empty array when the user has no answers for this path', async () => {
    const supabase = fakeSupabase([])
    expect(await getPathAnswers(supabase, 'p1', 'u1')).toEqual([])
  })

  it('maps question_id/answered_at for every answer row returned, including from a still-in-progress session', async () => {
    // The query never filters on quiz_sessions.completed_at — an answer counts
    // the moment it's submitted, regardless of whether its session was ever
    // marked complete (or was marked complete early via an exit).
    const supabase = fakeSupabase([
      { question_id: 'q1', answered_at: '2026-01-01T00:00:00Z' },
      { question_id: 'q2', answered_at: '2026-01-02T00:00:00Z' },
    ])
    expect(await getPathAnswers(supabase, 'p1', 'u1')).toEqual([
      { questionId: 'q1', answeredAt: '2026-01-01T00:00:00Z' },
      { questionId: 'q2', answeredAt: '2026-01-02T00:00:00Z' },
    ])
  })

  it('throws if the query errors', async () => {
    const supabase = fakeSupabase([], { message: 'boom' })
    await expect(getPathAnswers(supabase, 'p1', 'u1')).rejects.toThrow('boom')
  })
})

describe('getCoveredQuestionIds', () => {
  it('de-dupes a question answered across more than one session', async () => {
    const supabase = fakeSupabase([
      { question_id: 'q1', answered_at: '2026-01-01T00:00:00Z' },
      { question_id: 'q2', answered_at: '2026-01-02T00:00:00Z' },
      { question_id: 'q1', answered_at: '2026-02-01T00:00:00Z' },
    ])
    expect(await getCoveredQuestionIds(supabase, 'p1', 'u1')).toEqual(new Set(['q1', 'q2']))
  })

  it('does not count a question that was assigned to a session but never answered', async () => {
    // Regression case for the exit-quiz bug: a session can be marked complete
    // with far more ids in question_ids than were ever actually answered.
    // getCoveredQuestionIds only ever sees quiz_answers rows, so an assigned-
    // but-unanswered id simply never appears here.
    const supabase = fakeSupabase([{ question_id: 'q1', answered_at: '2026-01-01T00:00:00Z' }])
    expect(await getCoveredQuestionIds(supabase, 'p1', 'u1')).toEqual(new Set(['q1']))
  })
})
