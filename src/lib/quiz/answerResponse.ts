// ============================================================
// Interprets the reply from POST /api/quiz/answer.
//
// The one rule this exists to enforce: a request that failed to save must
// never be shown to the user as a *verdict*. The quiz page used to map every
// non-OK reply to `isCorrect: false`, so a rejected duplicate or a dropped
// connection rendered "Not quite." next to an option that was highlighted
// green from the question's own data.
// ============================================================

export type AnswerOutcome =
  | { kind: 'verdict'; isCorrect: boolean; alreadyAnswered: boolean }
  | { kind: 'resync' }
  | { kind: 'error'; message: string }

export const ANSWER_ERROR_CODES = {
  sessionCompleted: 'session_completed',
  notCurrentQuestion: 'not_current_question',
} as const

export function interpretAnswerResponse(status: number, body: unknown): AnswerOutcome {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>

  if (status >= 200 && status < 300 && typeof b.isCorrect === 'boolean') {
    return { kind: 'verdict', isCorrect: b.isCorrect, alreadyAnswered: false }
  }

  // Already answered: the server hands back the verdict it recorded the first
  // time, so a duplicate submission shows what actually counted.
  if (status === 409 && b.alreadyAnswered === true && typeof b.isCorrect === 'boolean') {
    return { kind: 'verdict', isCorrect: b.isCorrect, alreadyAnswered: true }
  }

  // The session moved on (another tab advanced it, or it was finished) —
  // the page should reload its real state rather than retry a stale question.
  if (b.code === ANSWER_ERROR_CODES.sessionCompleted || b.code === ANSWER_ERROR_CODES.notCurrentQuestion) {
    return { kind: 'resync' }
  }

  return { kind: 'error', message: typeof b.error === 'string' ? b.error : 'Could not save your answer.' }
}
