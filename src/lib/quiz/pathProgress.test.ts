import { describe, it, expect } from 'vitest'
import { getPathAnswers, getCoveredQuestionIds, getPathProgress } from '@/lib/quiz/pathProgress'
import type { QuizPath } from '@/types'

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

// Regression for the Oct 22 pace bug: the marker used to be (study days elapsed) x
// (the plan's CURRENT questions_per_day), a number reflowPace rewrites on every daily
// quiz — so it pinned at 100% nine days before the deadline.
describe('getPathProgress pace', () => {
  const poolIds = Array.from({ length: 655 }, (_, i) => `q${i}`)
  const answeredIds = poolIds.slice(0, 563)

  function fakeProgressSupabase() {
    return {
      from(table: string) {
        if (table === 'questions') {
          // fetchLivePoolQuestions looks the pool up 200 ids at a time.
          let ids: string[] = []
          const builder = {
            eq: () => builder,
            in: (_column: string, chunk: string[]) => {
              ids = chunk
              return builder
            },
            then: (resolve: (v: unknown) => void) =>
              resolve({ data: ids.map((id) => ({ id, category: 'c', situation_id: 's' })), error: null }),
          }
          return { select: () => builder }
        }
        if (table === 'quiz_answers') {
          const builder = {
            eq: () => builder,
            order: () =>
              Promise.resolve({
                data: answeredIds.map((id, i) => ({ question_id: id, answered_at: `2026-10-${String((i % 20) + 1).padStart(2, '0')}T12:00:00Z` })),
                error: null,
              }),
          }
          return { select: () => builder }
        }
        throw new Error(`unexpected table ${table}`)
      },
    } as unknown as import('@supabase/supabase-js').SupabaseClient
  }

  const pathWith = (questionsPerDay: number) =>
    ({
      id: 'p1',
      user_id: 'u1',
      pool_question_ids: poolIds,
      start_date: '2026-09-01',
      target_end_date: '2026-10-31',
      days_per_week: 5,
      questions_per_day: questionsPerDay,
    }) as unknown as QuizPath

  it('does not depend on the plan\'s current daily count', async () => {
    const now = new Date('2026-10-22T18:00:00Z')
    const results = await Promise.all([4, 19, 400].map((q) => getPathProgress(fakeProgressSupabase(), pathWith(q), now)))
    for (const r of results) {
      expect(r).toMatchObject({ poolSize: 655, coveredCount: 563, paceStatus: 'on-track', expectedCount: 550, expectedPercent: 84 })
    }
  })

  it('uses the viewer\'s time zone to decide what day it is', async () => {
    const justAfterEasternMidnight = new Date('2026-10-22T04:30:00Z')
    const eastern = await getPathProgress(fakeProgressSupabase(), pathWith(19), justAfterEasternMidnight, 'America/New_York')
    const pacific = await getPathProgress(fakeProgressSupabase(), pathWith(19), justAfterEasternMidnight, 'America/Los_Angeles')
    expect(eastern.expectedCount).toBe(550) // already Oct 22 in the east
    expect(pacific.expectedCount).toBe(535) // still the evening of Oct 21 in the west
  })
})
