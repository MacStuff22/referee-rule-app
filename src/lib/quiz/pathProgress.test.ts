import { describe, it, expect } from 'vitest'
import { getPathAnswers, getCoveredQuestionIds, getLatestAnswers, getPathProgress } from '@/lib/quiz/pathProgress'
import { planTodaysQuiz, remainingScheduledDays } from '@/lib/quiz/paths'
import type { QuizPath } from '@/types'

type Row = { question_id: string; answered_at: string; session_id?: string; is_correct?: boolean }

// Mimics the chained query: filters are ignored, rows come back a range at a time.
function fakeSupabase(rows: Row[], error: { message: string } | null = null) {
  const requested: [number, number][] = []
  const client = {
    requested,
    from(table: string) {
      if (table !== 'quiz_answers') throw new Error(`unexpected table ${table}`)
      const builder = {
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        range: (from: number, to: number) => {
          requested.push([from, to])
          return Promise.resolve({ data: error ? null : rows.slice(from, to + 1), error })
        },
      }
      return { select: () => builder }
    },
  }
  return client as typeof client & import('@supabase/supabase-js').SupabaseClient
}

describe('getPathAnswers', () => {
  it('returns an empty array when the user has no answers for this path', async () => {
    const supabase = fakeSupabase([])
    expect(await getPathAnswers(supabase, 'p1', 'u1')).toEqual([])
  })

  it('maps every answer row returned, including from a still-in-progress session', async () => {
    // The query never filters on quiz_sessions.completed_at — an answer counts
    // the moment it's submitted, regardless of whether its session was ever
    // marked complete (or was marked complete early via an exit).
    const supabase = fakeSupabase([
      { question_id: 'q1', answered_at: '2026-01-01T00:00:00Z', session_id: 's1', is_correct: true },
      { question_id: 'q2', answered_at: '2026-01-02T00:00:00Z', session_id: 's2', is_correct: false },
    ])
    expect(await getPathAnswers(supabase, 'p1', 'u1')).toEqual([
      { questionId: 'q1', sessionId: 's1', isCorrect: true, answeredAt: '2026-01-01T00:00:00Z' },
      { questionId: 'q2', sessionId: 's2', isCorrect: false, answeredAt: '2026-01-02T00:00:00Z' },
    ])
  })

  it('throws if the query errors', async () => {
    const supabase = fakeSupabase([], { message: 'boom' })
    await expect(getPathAnswers(supabase, 'p1', 'u1')).rejects.toThrow('boom')
  })

  // Supabase caps a single request at 1000 rows. Without paging, a plan with
  // more answers than that would silently lose the rest and look unfinished.
  it('pages past the 1000-row request limit so no answer is lost', async () => {
    const rows = Array.from({ length: 2300 }, (_, i) => ({ question_id: `q${i}`, answered_at: '2026-01-01T00:00:00Z' }))
    const supabase = fakeSupabase(rows)
    const answers = await getPathAnswers(supabase, 'p1', 'u1')
    expect(answers).toHaveLength(2300)
    expect(supabase.requested).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('stops after one request when a page comes back short', async () => {
    const supabase = fakeSupabase([{ question_id: 'q1', answered_at: '2026-01-01T00:00:00Z' }])
    await getPathAnswers(supabase, 'p1', 'u1')
    expect(supabase.requested).toEqual([[0, 999]])
  })
})

describe('getLatestAnswers', () => {
  it('keeps the most recent answer for each question, whichever quiz it was in', async () => {
    // Rows arrive oldest first: q1 was missed in the plan, then answered correctly in a later practice quiz.
    const supabase = fakeSupabase([
      { question_id: 'q1', answered_at: '2026-01-01T00:00:00Z', session_id: 'plan', is_correct: false },
      { question_id: 'q2', answered_at: '2026-01-02T00:00:00Z', session_id: 'plan', is_correct: false },
      { question_id: 'q1', answered_at: '2026-02-01T00:00:00Z', session_id: 'practice', is_correct: true },
    ])
    const latest = await getLatestAnswers(supabase, 'u1', ['q1', 'q2', 'q3'])
    expect(latest.get('q1')).toMatchObject({ sessionId: 'practice', isCorrect: true })
    expect(latest.get('q2')).toMatchObject({ sessionId: 'plan', isCorrect: false })
    expect(latest.has('q3')).toBe(false)
  })

  it('looks the questions up in chunks, not one giant id list', async () => {
    const supabase = fakeSupabase([])
    await getLatestAnswers(supabase, 'u1', Array.from({ length: 450 }, (_, i) => `q${i}`))
    expect(supabase.requested).toHaveLength(3) // 200 + 200 + 50
  })

  it('throws if a query errors', async () => {
    await expect(getLatestAnswers(fakeSupabase([], { message: 'boom' }), 'u1', ['q1'])).rejects.toThrow('boom')
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
          const rows = answeredIds.map((id, i) => ({
            question_id: id,
            answered_at: `2026-10-${String((i % 20) + 1).padStart(2, '0')}T12:00:00Z`,
          }))
          const builder = {
            eq: () => builder,
            order: () => builder,
            range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
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

  it('reports the quiz size the builder will use, not the number saved on the plan', async () => {
    const now = new Date('2026-10-22T18:00:00Z') // 92 questions left, 7 study days left -> 14 a day
    const todays = async (saved: number) => (await getPathProgress(fakeProgressSupabase(), pathWith(saved), now)).todaysQuestions
    expect(await todays(19)).toBe(14)
    expect(await todays(400)).toBe(14)
    // The reflow is still capped at twice the saved count, exactly as when building.
    expect(await todays(4)).toBe(8)
  })

  it('is exactly what planTodaysQuiz gives the quiz builder for the same plan and moment', async () => {
    const now = new Date('2026-10-22T18:00:00Z')
    const path = pathWith(19)
    const shown = (await getPathProgress(fakeProgressSupabase(), path, now)).todaysQuestions
    const built = planTodaysQuiz({
      uncoveredCount: 655 - 563,
      livePoolSize: 655,
      remainingDays: remainingScheduledDays(now, new Date(path.target_end_date), path.days_per_week),
      savedQuestionsPerDay: path.questions_per_day,
    }).questionCount
    expect(shown).toBe(built)
  })

  it('uses the viewer\'s time zone to decide what day it is', async () => {
    const justAfterEasternMidnight = new Date('2026-10-22T04:30:00Z')
    const eastern = await getPathProgress(fakeProgressSupabase(), pathWith(19), justAfterEasternMidnight, 'America/New_York')
    const pacific = await getPathProgress(fakeProgressSupabase(), pathWith(19), justAfterEasternMidnight, 'America/Los_Angeles')
    expect(eastern.expectedCount).toBe(550) // already Oct 22 in the east
    expect(pacific.expectedCount).toBe(535) // still the evening of Oct 21 in the west
  })
})
