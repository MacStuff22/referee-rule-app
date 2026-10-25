import { describe, it, expect } from 'vitest'
import { startButtonLabels } from '@/lib/quiz/startButton'

describe('startButtonLabels', () => {
  const base = { questionCount: 14, uncoveredCount: 92, inProgress: null }

  it('promises today\'s quiz with the count the builder will use', () => {
    expect(startButtonLabels(base)).toEqual({ label: "Do Today's 14 Questions", loadingLabel: "Building today's questions…" })
  })

  it('uses the singular for one question', () => {
    expect(startButtonLabels({ ...base, questionCount: 1 }).label).toBe("Do Today's 1 Question")
  })

  it('says Continue, with progress, when an unfinished quiz will be resumed', () => {
    const r = startButtonLabels({ ...base, inProgress: { total: 14, currentIndex: 1 } })
    expect(r.label).toBe('Continue Your Quiz — Question 2 of 14')
    expect(r.loadingLabel).toBe('Opening your quiz…')
  })

  it('resuming wins over everything else, since the builder resumes before it does anything', () => {
    expect(startButtonLabels({ ...base, uncoveredCount: 0, inProgress: { total: 9, currentIndex: 0 } }).label).toBe(
      'Continue Your Quiz — Question 1 of 9'
    )
  })

  it('never shows a question number past the end', () => {
    expect(startButtonLabels({ ...base, inProgress: { total: 5, currentIndex: 9 } }).label).toBe('Continue Your Quiz — Question 5 of 5')
  })

  it('says Finish when nothing is left to cover, because no quiz is built then', () => {
    expect(startButtonLabels({ ...base, uncoveredCount: 0 })).toEqual({ label: 'Finish This Plan', loadingLabel: 'Finishing…' })
  })
})
