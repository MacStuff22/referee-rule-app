import { describe, it, expect } from 'vitest'
import { computeTargetEndDate } from '@/lib/quiz/paths'
import {
  buildPathReport,
  defaultRetakeSize,
  describeTiming,
  nextSteps,
  pathTiming,
  RETAKE_PLAN_DEFAULTS,
  RETAKE_PLAN_MIN_MISSED,
  retakeSizeOptions,
  stillMissedQuestions,
  type ReportAnswer,
  type SectionResult,
} from '@/lib/quiz/pathReport'

const ET = 'America/New_York'
const DUE = new Date('2026-10-31')

// 'Rink' is in Section 1, 'Sticks' in Section 3, 'Boarding' in Section 6 (see SECTION_CATEGORIES).
const categories = new Map([
  ['rink', 'Rink'],
  ['stick', 'Sticks'],
  ['board', 'Boarding'],
])

let counter = 0
function answer(questionId: string, isCorrect: boolean, answeredAt: string, sessionId = 's1'): ReportAnswer {
  return { questionId: `${questionId}`, isCorrect, answeredAt, sessionId: `${sessionId}-${counter++ % 1}` }
}

/** n answers for one question id spread over a day, with the first `wrong` of them wrong. */
function batch(questionId: string, n: number, wrong: number, day = '2026-10-10'): ReportAnswer[] {
  return Array.from({ length: n }, (_, i) => answer(questionId, i >= wrong, `${day}T15:${String(i % 60).padStart(2, '0')}:00Z`))
}

describe('pathTiming', () => {
  // 15:00Z is 11am Eastern, safely the same calendar day in New York.
  it('is early when the last answer came before the due date', () => {
    expect(pathTiming(new Date('2026-10-26T15:00:00Z'), DUE, ET)).toEqual({ kind: 'early', days: 5, dueDate: '2026-10-31' })
  })

  it('is on time on the due date itself', () => {
    expect(pathTiming(new Date('2026-10-31T15:00:00Z'), DUE, ET)).toEqual({ kind: 'on-time', days: 0, dueDate: '2026-10-31' })
  })

  it('is late the day after, and counts days past', () => {
    expect(pathTiming(new Date('2026-11-03T15:00:00Z'), DUE, ET)).toEqual({ kind: 'late', days: 3, dueDate: '2026-10-31' })
  })

  it('judges the day in the viewer time zone: 9pm Pacific on the due date is still the due date', () => {
    // 04:00Z on Nov 1 is 9pm on Oct 31 in Los Angeles but already Nov 1 in New York.
    const at = new Date('2026-11-01T04:00:00Z')
    expect(pathTiming(at, DUE, 'America/Los_Angeles').kind).toBe('on-time')
    expect(pathTiming(at, DUE, ET)).toMatchObject({ kind: 'late', days: 1 })
  })
})

describe('describeTiming', () => {
  it('states each case plainly', () => {
    expect(describeTiming({ kind: 'early', days: 5, dueDate: '2026-10-31' })).toBe('Finished 5 days before your Oct 31 due date.')
    expect(describeTiming({ kind: 'early', days: 1, dueDate: '2026-10-31' })).toBe('Finished 1 day before your Oct 31 due date.')
    expect(describeTiming({ kind: 'on-time', days: 0, dueDate: '2026-10-31' })).toBe('Finished on your Oct 31 due date.')
    expect(describeTiming({ kind: 'late', days: 3, dueDate: '2026-10-31' })).toBe('Finished 3 days after your Oct 31 due date.')
  })
})

describe('buildPathReport', () => {
  const build = (answers: ReportAnswer[]) => buildPathReport({ answers, categoryByQuestionId: categories, targetEndDate: DUE, timeZone: ET })

  it('handles a plan with no answers without inventing numbers', () => {
    const r = build([])
    expect(r).toMatchObject({ finishedOn: null, timing: null, accuracy: null, studyDays: 0, trend: null, sections: [], finalSessionId: null })
  })

  it('counts answers, distinct questions, accuracy and study days', () => {
    const r = build([
      ...batch('rink', 4, 1, '2026-10-10'), // 1 wrong, 3 right
      ...batch('stick', 6, 0, '2026-10-12'),
    ])
    expect(r.totalAnswers).toBe(10)
    expect(r.questionsCovered).toBe(2)
    expect(r.accuracy).toBeCloseTo(0.9)
    expect(r.studyDays).toBe(2)
    expect(r.finishedOn).toBe('2026-10-12')
    expect(r.timing).toMatchObject({ kind: 'early', days: 19 })
  })

  it('finds the day of the final answer in the viewer time zone, not UTC', () => {
    // 02:30Z on Oct 13 is 10:30pm on Oct 12 in New York.
    const r = build([answer('rink', true, '2026-10-13T02:30:00Z', 'last')])
    expect(r.finishedOn).toBe('2026-10-12')
    expect(r.finalSessionId).toMatch(/^last/)
  })

  describe('sections', () => {
    it('rates a section with 10 or more answers and leaves a thinner one unrated, not 0%', () => {
      const r = build([...batch('rink', 10, 0), ...batch('stick', 3, 3)])
      const rink = r.sections.find((s) => s.section.startsWith('Section 1'))!
      const sticks = r.sections.find((s) => s.section.startsWith('Section 3'))!
      expect(rink).toMatchObject({ answered: 10, accuracy: 1, tier: 'strong' })
      expect(sticks).toMatchObject({ answered: 3, accuracy: null, tier: 'unrated' })
    })

    it('tiers at the mastery thresholds: 85% strong, 65% solid, below that building', () => {
      const r = build([...batch('rink', 20, 3), ...batch('stick', 20, 7), ...batch('board', 20, 8)]) // 85%, 65%, 60%
      const tier = (prefix: string) => r.sections.find((s) => s.section.startsWith(prefix))!.tier
      expect(tier('Section 1')).toBe('strong')
      expect(tier('Section 3')).toBe('solid')
      expect(tier('Section 6')).toBe('building')
    })

    it('only lists sections the plan touched, in handbook order', () => {
      const r = build([...batch('board', 10, 0), ...batch('rink', 10, 0)])
      expect(r.sections.map((s) => s.section.slice(0, 9))).toEqual(['Section 1', 'Section 6'])
    })

    it('calls out the lowest two rated sections below strong as the focus', () => {
      const r = build([...batch('rink', 20, 0), ...batch('stick', 20, 7), ...batch('board', 20, 10)])
      expect(r.focusSections.map((s) => s.section.slice(0, 9))).toEqual(['Section 6', 'Section 3'])
    })

    it('has no focus when every rated section is strong, and ignores unrated ones', () => {
      const r = build([...batch('rink', 20, 1), ...batch('stick', 3, 3)])
      expect(r.focusSections).toEqual([])
    })

    it('caps the focus at two sections', () => {
      const cats = new Map([...categories, ['hold', 'Holding']]) // Section 7
      const r = buildPathReport({
        answers: [...batch('rink', 20, 8), ...batch('stick', 20, 9), ...batch('board', 20, 10), ...batch('hold', 20, 11)],
        categoryByQuestionId: cats,
        targetEndDate: DUE,
        timeZone: ET,
      })
      expect(r.focusSections).toHaveLength(2)
    })
  })

  describe('trend', () => {
    const early = (n: number, wrong: number) => batch('rink', n, wrong, '2026-10-05')
    const later = (n: number, wrong: number) => batch('rink', n, wrong, '2026-10-20')

    it('shows an improvement of three points or more', () => {
      expect(build([...early(40, 10), ...later(40, 4)]).trend).toEqual({ from: 75, to: 90 })
    })

    it('hides a flat result', () => {
      expect(build([...early(40, 8), ...later(40, 8)]).trend).toBeNull()
    })

    it('hides a decline, never reporting it', () => {
      expect(build([...early(40, 4), ...later(40, 12)]).trend).toBeNull()
    })

    it('hides a gain smaller than three points', () => {
      expect(build([...early(100, 25), ...later(100, 24)]).trend).toBeNull() // 75% -> 76%
    })

    it('hides the comparison when either half is too small to be fair', () => {
      expect(build([...early(15, 5), ...later(15, 0)]).trend).toBeNull() // 15 answers a half
    })
  })
})

describe('stillMissedQuestions', () => {
  it('lists pool questions whose latest answer was wrong', () => {
    const missed = stillMissedQuestions({
      poolQuestionIds: ['a', 'b', 'c', 'd'],
      latestAnswers: new Map([
        ['a', { isCorrect: false }],
        ['b', { isCorrect: true }],
        ['c', { isCorrect: false }],
      ]),
      planAnswers: [],
    })
    expect(missed.map((m) => m.questionId)).toEqual(['a', 'c']) // d was never answered
  })

  it('drops a question missed in the plan but answered correctly in practice since', () => {
    const missed = stillMissedQuestions({
      poolQuestionIds: ['a'],
      latestAnswers: new Map([['a', { isCorrect: true }]]),
      planAnswers: [answer('a', false, '2026-10-01T15:00:00Z')],
    })
    expect(missed).toEqual([])
  })

  it('counts how often each was missed in the plan, at least once', () => {
    const missed = stillMissedQuestions({
      poolQuestionIds: ['a', 'b'],
      latestAnswers: new Map([
        ['a', { isCorrect: false }],
        ['b', { isCorrect: false }],
      ]),
      planAnswers: [
        answer('a', false, '2026-10-01T15:00:00Z'),
        answer('a', false, '2026-10-05T15:00:00Z'),
        answer('b', true, '2026-10-02T15:00:00Z'), // wrong only in later practice, not the plan
      ],
    })
    expect(missed).toEqual([
      { questionId: 'a', misses: 2 },
      { questionId: 'b', misses: 1 },
    ])
  })

  it('ignores answers to questions outside the pool', () => {
    const missed = stillMissedQuestions({
      poolQuestionIds: ['a'],
      latestAnswers: new Map([['zzz', { isCorrect: false }]]),
      planAnswers: [],
    })
    expect(missed).toEqual([])
  })
})

describe('nextSteps', () => {
  const focus = (section: string): SectionResult => ({ section, answered: 20, correct: 10, accuracy: 0.5, tier: 'building' })

  it('leads with the retake when five or more are missed', () => {
    expect(nextSteps(111, [focus('Section 1 – Playing Area')]).retake).toBe('primary')
    expect(nextSteps(5, []).retake).toBe('primary')
  })

  it('demotes the retake when only a few are missed', () => {
    expect(nextSteps(4, []).retake).toBe('secondary')
    expect(nextSteps(1, []).retake).toBe('secondary')
  })

  it('has nothing to retake after a clean sweep', () => {
    expect(nextSteps(0, []).retake).toBe('none')
  })

  it('practises the focus sections, using every category in them', () => {
    const steps = nextSteps(10, [focus('Section 1 – Playing Area')])
    expect(steps.practice).toBe('weakest')
    expect(steps.practiceCategories).toEqual(['Rink', 'Goal Posts and Nets', 'Benches', 'Signal and Timing Devices'])
  })

  it('retakes with a quick quiz below 20 missed and a study plan from 20 up', () => {
    expect(nextSteps(0, []).retakeFormat).toBe('none')
    expect(nextSteps(1, []).retakeFormat).toBe('quiz')
    expect(nextSteps(RETAKE_PLAN_MIN_MISSED - 1, []).retakeFormat).toBe('quiz')
    expect(nextSteps(RETAKE_PLAN_MIN_MISSED, []).retakeFormat).toBe('plan')
    expect(nextSteps(111, []).retakeFormat).toBe('plan')
  })

  it('offers a mixed quiz when no section needs attention', () => {
    expect(nextSteps(10, [])).toMatchObject({ practice: 'mixed', practiceCategories: [] })
  })
})

describe('retake size', () => {
  it('steps by five up to 35', () => {
    expect(retakeSizeOptions(111)).toEqual([5, 10, 15, 20, 25, 30, 35])
  })

  it('never offers more than were missed, with "all of them" as the last step', () => {
    expect(retakeSizeOptions(12)).toEqual([5, 10, 12])
    expect(retakeSizeOptions(20)).toEqual([5, 10, 15, 20])
    expect(retakeSizeOptions(7)).toEqual([5, 7])
  })

  it('offers nothing to choose when five or fewer are missed', () => {
    expect(retakeSizeOptions(5)).toEqual([5])
    expect(retakeSizeOptions(3)).toEqual([3])
    expect(retakeSizeOptions(1)).toEqual([1])
    expect(retakeSizeOptions(0)).toEqual([])
  })

  it('starts at ten when ten is on offer, otherwise at the most possible', () => {
    expect(defaultRetakeSize(retakeSizeOptions(111))).toBe(10)
    expect(defaultRetakeSize(retakeSizeOptions(10))).toBe(10)
    expect(defaultRetakeSize(retakeSizeOptions(7))).toBe(7)
    expect(defaultRetakeSize(retakeSizeOptions(3))).toBe(3)
    expect(defaultRetakeSize([])).toBe(0)
  })
})

describe('retake plan defaults', () => {
  // Morgan's own plan: 111 questions missed, 10 a session, 3 days a week.
  it('111 missed questions at 10 a session, 3 days a week is 12 sessions over 4 weeks', () => {
    const start = new Date('2026-11-02')
    const { questionsPerDay, daysPerWeek } = RETAKE_PLAN_DEFAULTS
    expect(Math.ceil(111 / questionsPerDay)).toBe(12)
    // The start date is day one, so 28 calendar days ends 27 days later.
    expect(computeTargetEndDate(111, questionsPerDay, start, daysPerWeek).toISOString().slice(0, 10)).toBe('2026-11-29')
  })

  it('the smallest retake plan, 20 questions, is 2 sessions over 5 days', () => {
    // 3 study days a week stretches each session over 7/3 calendar days.
    const start = new Date('2026-11-02')
    const { questionsPerDay, daysPerWeek } = RETAKE_PLAN_DEFAULTS
    expect(computeTargetEndDate(RETAKE_PLAN_MIN_MISSED, questionsPerDay, start, daysPerWeek).toISOString().slice(0, 10)).toBe('2026-11-06')
  })
})
