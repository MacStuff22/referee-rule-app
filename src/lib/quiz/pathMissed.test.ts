import { describe, it, expect } from 'vitest'
import { PoolRequestError, loadStillMissed, resolvePathPool } from '@/lib/quiz/pathMissed'

interface Fixture {
  /** The source plan row, or null when it isn't the user's. */
  source: { id: string; status: string; pool_question_ids: string[] } | null
  /** Every answer by this user, oldest first: [question, correct]. */
  history: [string, boolean][]
  /** Which of the plan's answers were given inside the plan itself. */
  inPlan: string[]
}

function fakeSupabase({ source, history, inPlan }: Fixture) {
  const client = {
    from(table: string) {
      if (table === 'quiz_paths') {
        const builder = {
          eq: () => builder,
          maybeSingle: () => Promise.resolve({ data: source, error: null }),
        }
        return { select: () => builder }
      }
      if (table === 'questions') {
        let ids: string[] = []
        const builder = {
          eq: () => builder,
          in: (_c: string, chunk: string[]) => {
            ids = chunk
            return builder
          },
          then: (resolve: (v: unknown) => void) =>
            resolve({ data: ids.map((id) => ({ id, category: 'Rink', situation_id: 's' })), error: null }),
        }
        return { select: () => builder }
      }
      if (table === 'quiz_answers') {
        let planOnly = false
        const rows = () =>
          history
            .filter(([q]) => !planOnly || inPlan.includes(q))
            .map(([q, ok], i) => ({ question_id: q, is_correct: ok, answered_at: `2026-10-01T00:00:${String(i).padStart(2, '0')}Z`, session_id: 's' }))
        const builder = {
          eq: (column: string) => {
            if (column === 'quiz_sessions.path_id') planOnly = true
            return builder
          },
          in: () => builder,
          order: () => builder,
          range: (from: number, to: number) => Promise.resolve({ data: rows().slice(from, to + 1), error: null }),
        }
        return { select: () => builder }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return client as unknown as import('@supabase/supabase-js').SupabaseClient
}

const plan = { id: 'p1', status: 'completed', pool_question_ids: ['a', 'b', 'c'] }

describe('loadStillMissed', () => {
  it('keeps only questions whose latest answer was wrong', async () => {
    const supabase = fakeSupabase({
      source: plan,
      // a: wrong then right (resolved). b: right then wrong (missed). c: wrong only once (missed).
      history: [['a', false], ['b', true], ['b', false], ['c', false], ['a', true]],
      inPlan: ['a', 'b', 'c'],
    })
    const { missed } = await loadStillMissed(supabase, plan, 'u1')
    expect(missed.map((m) => m.questionId).sort()).toEqual(['b', 'c'])
  })
})

describe('resolvePathPool for a missed-questions plan', () => {
  const filter = { type: 'missed_questions' as const, sourcePathId: 'p1' }

  it('builds the pool from the finished plan\'s still-missed questions and keeps the filter', async () => {
    const supabase = fakeSupabase({ source: plan, history: [['a', true], ['b', false], ['c', false]], inPlan: ['a', 'b', 'c'] })
    const pool = await resolvePathPool(supabase, 'u1', filter)
    expect(pool.questionIds.sort()).toEqual(['b', 'c'])
    expect(pool.resolvedFilter).toEqual(filter)
  })

  it('refuses a plan that is not the user\'s own', async () => {
    const supabase = fakeSupabase({ source: null, history: [], inPlan: [] })
    await expect(resolvePathPool(supabase, 'u1', filter)).rejects.toBeInstanceOf(PoolRequestError)
  })

  it('refuses a plan that is not finished yet', async () => {
    const supabase = fakeSupabase({ source: { ...plan, status: 'active' }, history: [], inPlan: [] })
    await expect(resolvePathPool(supabase, 'u1', filter)).rejects.toThrow('Finish that study plan')
  })

  it('has an empty pool when nothing is still missed', async () => {
    const supabase = fakeSupabase({ source: plan, history: [['a', true], ['b', true], ['c', true]], inPlan: ['a', 'b', 'c'] })
    expect((await resolvePathPool(supabase, 'u1', filter)).questionIds).toEqual([])
  })
})
