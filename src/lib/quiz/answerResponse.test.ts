import { describe, it, expect } from 'vitest'
import { interpretAnswerResponse } from '@/lib/quiz/answerResponse'

describe('interpretAnswerResponse', () => {
  it('returns the verdict for a normal successful save', () => {
    expect(interpretAnswerResponse(200, { isCorrect: true })).toEqual({ kind: 'verdict', isCorrect: true, alreadyAnswered: false })
    expect(interpretAnswerResponse(200, { isCorrect: false })).toEqual({ kind: 'verdict', isCorrect: false, alreadyAnswered: false })
  })

  it('returns the originally recorded verdict for a duplicate submission, not "incorrect"', () => {
    const body = { error: 'Question already answered', alreadyAnswered: true, isCorrect: true }
    expect(interpretAnswerResponse(409, body)).toEqual({ kind: 'verdict', isCorrect: true, alreadyAnswered: true })
  })

  it('never turns a failed save into a verdict', () => {
    expect(interpretAnswerResponse(500, { error: 'boom' })).toEqual({ kind: 'error', message: 'boom' })
    expect(interpretAnswerResponse(404, { error: 'Session not found' })).toEqual({ kind: 'error', message: 'Session not found' })
    expect(interpretAnswerResponse(401, { error: 'Unauthorized' })).toEqual({ kind: 'error', message: 'Unauthorized' })
  })

  it('treats a 409 without a recorded verdict as an error, not a wrong answer', () => {
    expect(interpretAnswerResponse(409, { error: 'Question already answered' }).kind).toBe('error')
  })

  it('asks the page to resync when the session moved on', () => {
    expect(interpretAnswerResponse(400, { code: 'not_current_question' })).toEqual({ kind: 'resync' })
    expect(interpretAnswerResponse(400, { code: 'session_completed' })).toEqual({ kind: 'resync' })
  })

  it('handles an unparseable or empty body with a generic error', () => {
    expect(interpretAnswerResponse(502, null)).toEqual({ kind: 'error', message: 'Could not save your answer.' })
    expect(interpretAnswerResponse(200, {})).toEqual({ kind: 'error', message: 'Could not save your answer.' })
  })
})
