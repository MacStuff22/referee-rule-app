'use client'

// Thin wrapper around the shared ScoreboardSimulator for the admin authoring
// preview. Kept as a named component so the question form's import is unchanged.
// The preview enables Replay and does not reveal correct answers (the admin is
// authoring and already knows them).

import { ScoreboardSimulator } from '@/components/quiz/scoreboard-simulator'
import type { ScoreboardEvent, ScoreboardPlayerAnswer, ScoreboardSituationType } from '@/types/scoreboard'

export interface ScoreboardPreviewProps {
  period: number
  startGT: number
  events: ScoreboardEvent[]
  playerAnswers: ScoreboardPlayerAnswer[]
  rationale: string
  ruleNumber: string
  situationType?: ScoreboardSituationType
}

export function ScoreboardPreview(props: ScoreboardPreviewProps) {
  return <ScoreboardSimulator {...props} allowReplay />
}
