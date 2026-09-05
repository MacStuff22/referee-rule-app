'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { MatchType } from '@/lib/situationMatches'
import type { Question } from '@/types'

export interface MatchGroup {
  situationId: string
  matchType: MatchType
  questions: Question[]
}

// Distinct wording per tier so the admin understands what each one implies —
// keep this the single place tier copy lives, not scattered through JSX.
const MATCH_TIER_COPY: Record<MatchType, { heading: string; body: string }> = {
  exact_match: {
    heading: 'Exact match',
    body: 'This question’s text and answer should always stay identical to the situation(s) below. Review them yourself, or let the system update them to match what you just saved.',
  },
  very_similar: {
    heading: 'Very similar',
    body: 'This question shares the same ruling with the situation(s) below, even though the wording or question type differs. Review them to make sure the ruling is still consistent.',
  },
  similar_concept: {
    heading: 'Similar concept',
    body: 'This question shares a rule concept with the situation(s) below, but they may have a different outcome. Check whether your change should carry over.',
  },
}

const TIER_ORDER: MatchType[] = ['exact_match', 'very_similar', 'similar_concept']

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: MatchGroup[]
  canAutoUpdate: boolean
  onReviewManually: (questionIds: string[]) => void
  onAutoUpdate: () => void
}

export function MatchPromptDialog({ open, onOpenChange, groups, canAutoUpdate, onReviewManually, onAutoUpdate }: Props) {
  const tiers = TIER_ORDER.map((tier) => ({ tier, groups: groups.filter((g) => g.matchType === tier) })).filter(
    (t) => t.groups.length > 0
  )
  const allQuestionIds = groups.flatMap((g) => g.questions.map((q) => q.id))
  const hasExactMatch = groups.some((g) => g.matchType === 'exact_match')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Known matching questions</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {tiers.map(({ tier, groups: tierGroups }) => (
            <div key={tier} className="space-y-2">
              <p className="text-sm font-medium">{MATCH_TIER_COPY[tier].heading}</p>
              <p className="text-sm text-gray-600">{MATCH_TIER_COPY[tier].body}</p>
              <ul className="text-sm text-gray-700 list-disc list-inside">
                {tierGroups.map((g) => (
                  <li key={g.situationId}>
                    Situation {g.situationId}
                    {g.questions.length > 1 ? ` (${g.questions.length} questions)` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex gap-3 flex-wrap pt-2">
          <Button variant="outline" onClick={() => onReviewManually(allQuestionIds)} className="flex-1 min-w-40">
            Review manually
          </Button>
          {hasExactMatch && (
            <Button
              onClick={onAutoUpdate}
              disabled={!canAutoUpdate}
              title={canAutoUpdate ? undefined : 'The matched question is a different question or answer type — review it manually instead.'}
              className="flex-1 min-w-40"
            >
              Auto-update the others
            </Button>
          )}
        </div>
        {hasExactMatch && !canAutoUpdate && (
          <p className="text-xs text-gray-400">
            Auto-update isn’t available because a matched question is a different question or answer type.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
