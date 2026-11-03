import { describe, it, expect } from 'vitest'
import { completePathIfFinished } from '@/lib/quiz/pathFinish'

const POOL = ['q1', 'q2', 'q3']

/** A client where the live pool is `livePoolIds`, the plan's answers cover `answeredIds`, and the status update matches `updateMatches` rows. */
function fakeSupabase({
  livePoolIds = POOL,
  answeredIds,
  updateMatches = 1,
  updateError = null,
}: {
  livePoolIds?: string[]
  answeredIds: string[]
  updateMatches?: number
  updateError?: { message: string } | null
}) {
  const updates: Record<string, unknown>[] = []
  const client = {
    updates,
    from(table: string) {
      if (table === 'questions') {
        let ids: string[] = []
        const builder = {
          eq: () => builder,
          in: (_column: string, chunk: string[]) => {
            ids = chunk.filter((id) => livePoolIds.includes(id))
            return builder
          },
          then: (resolve: (v: unknown) => void) =>
            resolve({ data: ids.map((id) => ({ id, category: 'c', situation_id: 's' })), error: null }),
        }
        return { select: () => builder }
      }
      if (table === 'quiz_answers') {
        const rows = answeredIds.map((id) => ({ question_id: id, answered_at: '2026-10-01T12:00:00Z', session_id: 's', is_correct: true }))
        const builder = {
          eq: () => builder,
          order: () => builder,
          range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
        }
        return { select: () => builder }
      }
      if (table === 'quiz_paths') {
        return {
          update: (values: Record<string, unknown>) => {
            updates.push(values)
            const builder = {
              eq: () => builder,
              select: () =>
                Promise.resolve({
                  data: updateError ? null : Array.from({ length: updateMatches }, () => ({ id: 'p1' })),
                  error: updateError,
                }),
            }
            return builder
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return client as typeof client & import('@supabase/supabase-js').SupabaseClient
}

const path = (status: 'active' | 'completed' | 'abandoned' = 'active') => ({ id: 'p1', status, pool_question_ids: POOL })

describe('completePathIfFinished', () => {
  it('completes the plan and says so when the last question has just been covered', async () => {
    const supabase = fakeSupabase({ answeredIds: ['q1', 'q2', 'q3'] })
    expect(await completePathIfFinished(supabase, path(), 'u1')).toBe('just-completed')
    expect(supabase.updates).toEqual([{ status: 'completed' }])
  })

  it('leaves the plan alone while any question is still uncovered', async () => {
    const supabase = fakeSupabase({ answeredIds: ['q1', 'q2'] })
    expect(await completePathIfFinished(supabase, path(), 'u1')).toBe('not-finished')
    expect(supabase.updates).toEqual([])
  })

  it('does not celebrate twice: a plan that is already completed is not touched', async () => {
    const supabase = fakeSupabase({ answeredIds: ['q1', 'q2', 'q3'] })
    expect(await completePathIfFinished(supabase, path('completed'), 'u1')).toBe('already-completed')
    expect(supabase.updates).toEqual([])
  })

  it('reports already-completed when another request flipped the status first', async () => {
    // The update is conditional on the plan still being active, so the loser of a race matches no rows.
    const supabase = fakeSupabase({ answeredIds: ['q1', 'q2', 'q3'], updateMatches: 0 })
    expect(await completePathIfFinished(supabase, path(), 'u1')).toBe('already-completed')
  })

  it('never completes an abandoned plan', async () => {
    const supabase = fakeSupabase({ answeredIds: ['q1', 'q2', 'q3'] })
    expect(await completePathIfFinished(supabase, path('abandoned'), 'u1')).toBe('not-finished')
    expect(supabase.updates).toEqual([])
  })

  it('ignores a pool question that has since been unapproved', async () => {
    // q3 is no longer live, so covering q1 and q2 is enough.
    const supabase = fakeSupabase({ livePoolIds: ['q1', 'q2'], answeredIds: ['q1', 'q2'] })
    expect(await completePathIfFinished(supabase, path(), 'u1')).toBe('just-completed')
  })

  it('throws if the status update fails, so the caller can decide what to do', async () => {
    const supabase = fakeSupabase({ answeredIds: ['q1', 'q2', 'q3'], updateError: { message: 'boom' } })
    await expect(completePathIfFinished(supabase, path(), 'u1')).rejects.toThrow('boom')
  })
})
