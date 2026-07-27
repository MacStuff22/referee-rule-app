// ============================================================
// Question "features" — an intentionally extensible checklist used by the
// Test Quiz filter (src/components/admin/test-quiz-setup.tsx).
//
// This list is meant to grow over time as new distinguishing question
// capabilities are added. Per Morgan's standing instruction: whenever a new
// feature/property is added to questions, ask her whether it should be
// added here (and what to call it) before assuming — don't add entries
// silently.
// ============================================================

import type { Question } from '@/types'
import { parseScoreboardConfig } from '@/types/scoreboard'

export interface QuestionFeatureDef {
  id: string
  label: string
  matches: (q: Question) => boolean
}

function hasPenaltyTable(q: Question): boolean {
  const pt = q.penalty_table as { teamA?: unknown[]; teamB?: unknown[] } | null | undefined
  return !!pt && ((pt.teamA?.length ?? 0) > 0 || (pt.teamB?.length ?? 0) > 0)
}

export const QUESTION_FEATURES: QuestionFeatureDef[] = [
  {
    id: 'penalty-expiration',
    label: 'Penalty Expiration Question',
    matches: (q) => {
      if (q.question_type !== 'scoreboard') return false
      const config = parseScoreboardConfig(q.sub_questions?.[0])
      return config?.situation_type === 'expiration'
    },
  },
  {
    id: 'coincidental-penalty',
    label: 'Coincidental Penalty Question',
    matches: (q) => {
      if (q.question_type !== 'scoreboard') return false
      const config = parseScoreboardConfig(q.sub_questions?.[0])
      return config?.situation_type === 'coincidental'
    },
  },
  {
    id: 'penalty-table',
    label: 'Penalty Table',
    matches: hasPenaltyTable,
  },
]
