'use client'

import { QuizRunner } from '@/components/quiz/quiz-runner'
import type { Question } from '@/types'

const withSituation: Question = {
  id: 'mock-1',
  text: 'Sample question text.',
  answer_type: 'multiple_choice',
  options: ['Option A', 'Option B'],
  correct_answers: [0],
  rationale: 'Because.',
  rule_number: '63.6 P.2',
  rule_references: ['63.6 P.2'],
  handbook_section: '',
  situation_id: '70F',
  league: 'both',
  category: 'Coincidental Penalties',
  question_type: 'situation',
  sub_questions: [],
  penalty_table: { teamA: [], teamB: [] },
  is_approved: true,
  created_by: '',
  created_at: '',
}

const withoutSituation: Question = { ...withSituation, id: 'mock-2', situation_id: '' }

export default function DevBadgeTest() {
  return (
    <div className="max-w-2xl mx-auto space-y-10 py-10">
      <div>
        <p className="text-xs font-bold uppercase text-gray-400 mb-2">Has situation_id (&quot;70F&quot;) — select an option, submit</p>
        <QuizRunner
          key="a"
          question={withSituation}
          progress={{ current: 1, total: 1 }}
          onAnswered={async () => ({ isCorrect: true })}
          onNext={() => {}}
          nextLabel="Next →"
        />
      </div>
      <div>
        <p className="text-xs font-bold uppercase text-gray-400 mb-2">No situation_id — select an option, submit</p>
        <QuizRunner
          key="b"
          question={withoutSituation}
          progress={{ current: 1, total: 1 }}
          onAnswered={async () => ({ isCorrect: true })}
          onNext={() => {}}
          nextLabel="Next →"
        />
      </div>
    </div>
  )
}
