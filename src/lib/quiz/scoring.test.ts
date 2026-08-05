import { describe, it, expect } from 'vitest'
import { scoreStandardAnswer, scoreCompoundAnswer, scoreScoreboardAnswer, scoreAnswer } from '@/lib/quiz/scoring'
import { encodeCompoundAnswer, encodeScoreboardAnswer } from '@/lib/quiz/answers'
import type { Question } from '@/types'

function baseQuestion(overrides: Partial<Question>): Question {
  return {
    id: 'q1',
    text: '',
    answer_type: 'multiple_choice',
    options: [],
    correct_answers: [],
    rationale: '',
    rule_number: '',
    rule_references: [],
    handbook_section: '',
    situation_id: '',
    league: 'both',
    category: '',
    question_type: 'situation',
    sub_questions: [],
    penalty_table: { teamA: [], teamB: [] },
    is_approved: true,
    created_by: '',
    created_at: '',
    ...overrides,
  }
}

describe('scoreStandardAnswer', () => {
  const q = baseQuestion({ correct_answers: [1, 3] })

  it('matches regardless of selection order', () => {
    expect(scoreStandardAnswer(q, [3, 1])).toBe(true)
  })
  it('rejects a wrong selection', () => {
    expect(scoreStandardAnswer(q, [1, 2])).toBe(false)
  })
  it('rejects a partial selection', () => {
    expect(scoreStandardAnswer(q, [1])).toBe(false)
  })
  it('treats non-array input as empty', () => {
    expect(scoreStandardAnswer(q, null)).toBe(false)
  })
})

describe('scoreCompoundAnswer', () => {
  const q = baseQuestion({
    question_type: 'compound',
    sub_questions: [
      { text: 'p1', answer_type: 'multiple_choice', options: [], correct_answers: [0], rationale: '' },
      { text: 'p2', answer_type: 'multi_select', options: [], correct_answers: [1, 2], rationale: '' },
    ],
  })

  it('requires every sub-question correct', () => {
    const perPart = [[0], [1, 2]]
    expect(scoreCompoundAnswer(q, encodeCompoundAnswer(perPart))).toBe(true)
  })
  it('fails if any single sub-question is wrong', () => {
    const perPart = [[0], [1]]
    expect(scoreCompoundAnswer(q, encodeCompoundAnswer(perPart))).toBe(false)
  })
  it('handles the legacy -1-separated format', () => {
    expect(scoreCompoundAnswer(q, [0, -1, 1, 2])).toBe(true)
  })
})

describe('scoreScoreboardAnswer', () => {
  const q = baseQuestion({
    question_type: 'scoreboard',
    sub_questions: [
      {
        situation_type: 'expiration',
        period: 3,
        start_gt: 200,
        events: [],
        player_answers: [
          { team: 'A', player: '5', correct_secs: 83, wash_out: false, already_expired: false },
          { team: 'B', player: '9', correct_secs: 0, wash_out: true, already_expired: false },
          { team: 'A', player: '2', correct_secs: 40, wash_out: false, already_expired: true },
        ],
      } as any,
    ],
  })

  it('matches correct times and wash-outs, ignoring already-expired players', () => {
    const entries = [
      { washOut: false, secs: 83 },
      { washOut: true, secs: null },
    ]
    expect(scoreScoreboardAnswer(q, encodeScoreboardAnswer(entries))).toBe(true)
  })
  it('fails on a wrong time', () => {
    const entries = [
      { washOut: false, secs: 84 },
      { washOut: true, secs: null },
    ]
    expect(scoreScoreboardAnswer(q, encodeScoreboardAnswer(entries))).toBe(false)
  })
  it('fails if wash-out is claimed but not correct, or vice versa', () => {
    const entries = [
      { washOut: true, secs: null },
      { washOut: false, secs: 10 },
    ]
    expect(scoreScoreboardAnswer(q, encodeScoreboardAnswer(entries))).toBe(false)
  })
  it('returns false for a misconfigured scoreboard question', () => {
    const broken = baseQuestion({ question_type: 'scoreboard', sub_questions: [] })
    expect(scoreScoreboardAnswer(broken, [])).toBe(false)
  })
})

describe('scoreAnswer dispatch', () => {
  it('routes to the standard scorer by default', () => {
    const q = baseQuestion({ question_type: 'written', correct_answers: [0] })
    expect(scoreAnswer(q, [0])).toBe(true)
  })
  it('routes compound questions to the compound scorer', () => {
    const q = baseQuestion({
      question_type: 'compound',
      sub_questions: [{ text: '', answer_type: 'multiple_choice', options: [], correct_answers: [0], rationale: '' }],
    })
    expect(scoreAnswer(q, encodeCompoundAnswer([[0]]))).toBe(true)
  })
  it('routes scoreboard questions to the scoreboard scorer', () => {
    const q = baseQuestion({
      question_type: 'scoreboard',
      sub_questions: [
        {
          situation_type: 'expiration',
          period: 1,
          start_gt: 100,
          events: [],
          player_answers: [{ team: 'A', player: '1', correct_secs: 5, wash_out: false, already_expired: false }],
        } as any,
      ],
    })
    expect(scoreAnswer(q, encodeScoreboardAnswer([{ washOut: false, secs: 5 }]))).toBe(true)
  })
})
