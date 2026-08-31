import { describe, it, expect } from 'vitest'
import { getAnsweredQuestionIds } from '@/lib/quiz/performance'

function fakeSupabase(sessions: { id: string }[], answers: { question_id: string; answered_at: string }[]) {
  return {
    from(table: string) {
      if (table === 'quiz_sessions') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: sessions }),
          }),
        }
      }
      if (table === 'quiz_answers') {
        const builder = {
          _rows: answers,
          in() {
            return builder
          },
          gte(_col: string, since: string) {
            builder._rows = builder._rows.filter((a) => a.answered_at >= since)
            return builder
          },
          then(resolve: (v: { data: typeof answers }) => void) {
            resolve({ data: builder._rows })
          },
        }
        return { select: () => builder }
      }
      throw new Error(`unexpected table ${table}`)
    },
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('getAnsweredQuestionIds', () => {
  it('returns an empty set when the user has no sessions', async () => {
    const supabase = fakeSupabase([], [])
    expect(await getAnsweredQuestionIds(supabase, 'u1')).toEqual(new Set())
  })

  it('returns every distinct question id with no date filter', async () => {
    const supabase = fakeSupabase(
      [{ id: 's1' }],
      [
        { question_id: 'q1', answered_at: '2026-01-01T00:00:00Z' },
        { question_id: 'q2', answered_at: '2026-01-02T00:00:00Z' },
        { question_id: 'q1', answered_at: '2026-01-03T00:00:00Z' },
      ]
    )
    expect(await getAnsweredQuestionIds(supabase, 'u1')).toEqual(new Set(['q1', 'q2']))
  })

  it('restricts to answers on/after sinceDate when given', async () => {
    const supabase = fakeSupabase(
      [{ id: 's1' }],
      [
        { question_id: 'q1', answered_at: '2026-01-01T00:00:00Z' },
        { question_id: 'q2', answered_at: '2026-01-10T00:00:00Z' },
      ]
    )
    const result = await getAnsweredQuestionIds(supabase, 'u1', new Date('2026-01-05T00:00:00Z'))
    expect(result).toEqual(new Set(['q2']))
  })
})
