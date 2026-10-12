import { describe, it, expect } from 'vitest'
import { orderByQuizPosition } from '@/lib/quiz/review'

const ids = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11']
const row = (question_id: string) => ({ question_id })

describe('orderByQuizPosition', () => {
  it('puts scrambled rows back into the order the quiz ran', () => {
    // The real row order the results page received for the Oct 7 session.
    const arrival = [5, 1, 7, 3, 8, 4, 11, 2, 6, 9, 10].map((n) => row(`q${n}`))
    expect(orderByQuizPosition(arrival, ids).map((r) => r.question_id)).toEqual(ids)
  })

  it('keeps only the answered rows, in order, for a session exited early', () => {
    const arrival = [row('q3'), row('q1'), row('q2')]
    expect(orderByQuizPosition(arrival, ids).map((r) => r.question_id)).toEqual(['q1', 'q2', 'q3'])
  })

  it('sorts a row whose question is not in the session last, without throwing', () => {
    const arrival = [row('stray'), row('q2'), row('q1')]
    expect(orderByQuizPosition(arrival, ids).map((r) => r.question_id)).toEqual(['q1', 'q2', 'stray'])
  })

  it('does not mutate the input and carries other fields through', () => {
    const arrival = [{ question_id: 'q2', is_correct: true }, { question_id: 'q1', is_correct: false }]
    const result = orderByQuizPosition(arrival, ids)
    expect(arrival.map((r) => r.question_id)).toEqual(['q2', 'q1'])
    expect(result).toEqual([{ question_id: 'q1', is_correct: false }, { question_id: 'q2', is_correct: true }])
  })

  it('handles no rows', () => {
    expect(orderByQuizPosition([], ids)).toEqual([])
  })
})
