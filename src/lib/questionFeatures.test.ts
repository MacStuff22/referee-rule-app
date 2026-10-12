import { describe, it, expect } from 'vitest'
import { QUESTION_FEATURES, matchesAnyFeature } from '@/lib/questionFeatures'
import type { Question } from '@/types'

function q(overrides: Partial<Question>): Question {
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
    league: ['NHL', 'AHL'],
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

describe('Has video feature', () => {
  const feature = QUESTION_FEATURES.find((f) => f.id === 'has-video')!

  it('is registered with the agreed label', () => {
    expect(feature.label).toBe('Has video')
  })
  it('matches questions with a clip, across formats', () => {
    expect(feature.matches(q({ video_path: 'questions/a.mp4' }))).toBe(true)
    expect(feature.matches(q({ question_type: 'compound', video_path: 'questions/a.mp4' }))).toBe(true)
  })
  it('does not match questions without one', () => {
    expect(feature.matches(q({}))).toBe(false)
    expect(feature.matches(q({ video_path: '' }))).toBe(false)
  })
  it('works through matchesAnyFeature', () => {
    expect(matchesAnyFeature(q({ video_path: 'questions/a.mp4' }), new Set(['has-video']))).toBe(true)
    expect(matchesAnyFeature(q({}), new Set(['has-video']))).toBe(false)
  })
})
