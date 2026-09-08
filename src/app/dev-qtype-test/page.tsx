import { Suspense } from 'react'
import QuestionsClient from '@/components/admin/questions-client'
import type { Question } from '@/types'

function makeQuestion(overrides: Partial<Question>): Question {
  return {
    id: overrides.id ?? 'q',
    text: 'Sample question text.',
    answer_type: 'multiple_choice',
    options: ['A', 'B'],
    correct_answers: [0],
    rationale: 'Because.',
    rule_number: '19.4',
    rule_references: ['19.4'],
    handbook_section: '',
    situation_id: '',
    league: ['NHL', 'AHL'],
    category: 'Coincidental Penalties',
    question_type: 'situation',
    sub_questions: [],
    penalty_table: { teamA: [], teamB: [] },
    is_approved: true,
    created_by: '',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

const questions: Question[] = [
  makeQuestion({ id: 'q-mc', question_type: 'situation', answer_type: 'multiple_choice' }),
  makeQuestion({ id: 'q-ms', question_type: 'situation', answer_type: 'multi_select' }),
  makeQuestion({ id: 'q-compound', question_type: 'compound' }),
  makeQuestion({ id: 'q-scoreboard', question_type: 'scoreboard' }),
]

export default function DevQTypeTest() {
  return (
    <div className="max-w-4xl mx-auto py-10">
      <Suspense fallback={<div>Loading…</div>}>
        <QuestionsClient questions={questions} />
      </Suspense>
    </div>
  )
}
