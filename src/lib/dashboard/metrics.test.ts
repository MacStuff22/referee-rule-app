import { describe, it, expect } from 'vitest'
import {
  dayKey,
  addDays,
  weekStart,
  last30Days,
  biweeklyTrend,
  coverage,
  readiness,
  readinessLabel,
  studyPlan,
  strengthMap,
  forgivingStreak,
  momentum,
  missedQuestions,
  milestones,
  type AnswerRecord,
  type MasteryInfo,
  type QuestionMeta,
} from '@/lib/dashboard/metrics'

// Thu Oct 1 2026, noon Eastern (16:00 UTC)
const NOW = new Date('2026-10-01T16:00:00Z')
const DAY = 86_400_000

function answer(daysAgo: number, isCorrect: boolean, questionId = 'q1', sessionId = 's1'): AnswerRecord {
  return { questionId, sessionId, isCorrect, answeredAt: new Date(NOW.getTime() - daysAgo * DAY).toISOString() }
}

function many(daysAgo: number, correct: number, wrong: number): AnswerRecord[] {
  return [
    ...Array.from({ length: correct }, () => answer(daysAgo, true)),
    ...Array.from({ length: wrong }, () => answer(daysAgo, false)),
  ]
}

const Q = (id: string, category: string, ruleReferences: string[] = []): QuestionMeta => ({
  id,
  text: `Question ${id}`,
  category,
  ruleReferences,
})

const M = (category: string, ema: number, total: number, daysAgo: number | null, interval = 14): MasteryInfo => ({
  category,
  emaScore: ema,
  totalAnswered: total,
  lastAnsweredAt: daysAgo === null ? null : new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
  refreshIntervalDays: interval,
})

describe('day helpers', () => {
  it('buckets by Eastern Time, not UTC', () => {
    // 02:00 UTC on Oct 2 is still 10pm Oct 1 in Eastern
    expect(dayKey(new Date('2026-10-02T02:00:00Z'))).toBe('2026-10-01')
  })
  it('adds days across month ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
  })
  it('finds the Monday of a week', () => {
    expect(weekStart('2026-10-01')).toBe('2026-09-28') // Thursday -> Monday
    expect(weekStart('2026-09-28')).toBe('2026-09-28')
    expect(weekStart('2026-10-04')).toBe('2026-09-28') // Sunday
  })
})

describe('last30Days', () => {
  it('compares the last 30 days with the 30 before', () => {
    const answers = [...many(5, 8, 2), ...many(40, 6, 4)]
    const r = last30Days(answers, NOW)
    expect(r.current.accuracy).toBeCloseTo(0.8)
    expect(r.previous.accuracy).toBeCloseTo(0.6)
    expect(r.deltaPoints).toBe(20)
  })
  it('refuses to show a percentage from too few answers', () => {
    const r = last30Days(many(5, 3, 1), NOW)
    expect(r.current.accuracy).toBeNull()
    expect(r.deltaPoints).toBeNull()
  })
  it('has no delta when the previous window is too small', () => {
    expect(last30Days(many(5, 9, 1), NOW).deltaPoints).toBeNull()
  })
})

describe('biweeklyTrend', () => {
  it('returns seven points oldest first with changes between them', () => {
    const answers = [...many(1, 9, 1), ...many(15, 7, 3)]
    const t = biweeklyTrend(answers, NOW)
    expect(t).toHaveLength(7)
    expect(t[6].accuracy).toBeCloseTo(0.9)
    expect(t[5].accuracy).toBeCloseTo(0.7)
    expect(t[6].deltaPoints).toBe(20)
    expect(t[0].accuracy).toBeNull()
    expect(t[6].label).toBe('Oct 1')
  })
})

describe('coverage', () => {
  it('counts rolling-90 separately from all-time', () => {
    const questions = [Q('a', 'Rink'), Q('b', 'Rink'), Q('c', 'Puck'), Q('d', 'Puck')]
    const answers = [answer(10, true, 'a'), answer(200, true, 'b'), answer(300, true, 'gone')]
    const c = coverage(answers, questions, [], NOW)
    expect(c.totalQuestions).toBe(4)
    expect(c.seenRolling).toBe(1)
    expect(c.seenAllTime).toBe(2) // 'gone' is no longer an approved question
    expect(c.topicsRolling).toBe(1)
    expect(c.totalTopics).toBe(2)
  })
  it('counts mastered topics', () => {
    const c = coverage([], [Q('a', 'Rink')], [M('Rink', 0.9, 10, 1)], NOW)
    expect(c.topicsMastered).toBe(1)
  })
})

describe('readiness', () => {
  it('has no score without enough recent answers', () => {
    const l = last30Days([], NOW)
    const c = coverage([], [Q('a', 'Rink')], [], NOW)
    expect(readiness(l, c, [], NOW).score).toBeNull()
  })
  it('blends accuracy, coverage and freshness', () => {
    const answers = [...many(2, 8, 2)].map((a, i) => ({ ...a, questionId: i < 5 ? 'a' : 'b' }))
    const questions = [Q('a', 'Rink'), Q('b', 'Rink'), Q('c', 'Rink'), Q('d', 'Rink')]
    const masteries = [M('Rink', 0.8, 10, 2)]
    const r = readiness(last30Days(answers, NOW), coverage(answers, questions, masteries, NOW), masteries, NOW)
    // 0.5*0.8 + 0.25*0.5 + 0.25*1 = 0.775
    expect(r.score).toBe(78)
    expect(r.label).toBe('On Track')
    expect(r.staleTopics).toBe(0)
  })
  it('scores on accuracy and coverage alone when no topics have been started', () => {
    const answers = many(2, 8, 2)
    const questions = [Q('q1', 'Rink'), Q('q2', 'Rink')]
    const r = readiness(last30Days(answers, NOW), coverage(answers, questions, [], NOW), [], NOW)
    // (0.5*0.8 + 0.25*0.5) / 0.75 = 0.7
    expect(r.score).toBe(70)
    expect(r.freshness).toBeNull()
  })
  it('labels by band', () => {
    expect(readinessLabel(39)).toBe('Getting Started')
    expect(readinessLabel(40)).toBe('Building')
    expect(readinessLabel(60)).toBe('On Track')
    expect(readinessLabel(80)).toBe('Exam Ready')
  })
})

describe('studyPlan', () => {
  const questions = [
    Q('p1', 'Penalty Shot', ['84.4']),
    Q('p2', 'Penalty Shot', ['84.4', '84.2']),
    Q('r1', 'Rink'),
    Q('f1', 'Face-offs'),
  ]
  it('ranks weak spots above fading above not-started, and explains each', () => {
    const answers = [
      ...['p1', 'p2', 'p1', 'p2', 'p1', 'p2'].map((id, i) => answer(i, i < 4 ? false : true, id)),
    ]
    const masteries = [M('Penalty Shot', 0.4, 6, 1), M('Rink', 0.9, 10, 40)]
    const plan = studyPlan(answers, questions, masteries, NOW)
    expect(plan.map((p) => [p.category, p.kind])).toEqual([
      ['Penalty Shot', 'weak'],
      ['Rink', 'fading'],
      ['Face-offs', 'new'],
    ])
    expect(plan[0].reason).toBe('Missed 4 of your last 6')
    expect(plan[0].rules[0]).toBe('84.4')
    expect(plan[1].reason).toBe('Last practiced 6 weeks ago')
  })
  it('skips categories with no approved questions and topics that are fine', () => {
    const plan = studyPlan([], [Q('r1', 'Rink')], [M('Rink', 0.9, 10, 2)], NOW)
    expect(plan).toEqual([])
  })
})

describe('strengthMap', () => {
  it('groups topics by section and marks unseen ones as new', () => {
    const map = strengthMap([M('Rink', 0.9, 10, 1)], [Q('a', 'Rink'), Q('b', 'Benches')])
    expect(map).toHaveLength(1)
    expect(map[0].section).toBe('Section 1 – Playing Area')
    expect(map[0].tiles).toEqual([
      { category: 'Rink', status: 'mastered' },
      { category: 'Benches', status: 'new' },
    ])
  })
})

describe('forgivingStreak', () => {
  const counts = (keys: string[]) => new Map(keys.map((k) => [k, 5]))
  it('counts consecutive days, today pending does not break it', () => {
    const c = counts(['2026-09-30', '2026-09-29', '2026-09-28'])
    expect(forgivingStreak(c, '2026-10-01')).toEqual({ streak: 3, restDayUsed: false })
  })
  it('counts today when done', () => {
    expect(forgivingStreak(counts(['2026-10-01', '2026-09-30']), '2026-10-01').streak).toBe(2)
  })
  it('forgives a single missed day', () => {
    const c = counts(['2026-09-30', '2026-09-29', '2026-09-27', '2026-09-26'])
    expect(forgivingStreak(c, '2026-10-01')).toEqual({ streak: 4, restDayUsed: true })
  })
  it('breaks on a second miss inside the same week', () => {
    const c = counts(['2026-09-30', '2026-09-28', '2026-09-26'])
    expect(forgivingStreak(c, '2026-10-01').streak).toBe(2)
  })
  it('breaks on two missed days in a row', () => {
    expect(forgivingStreak(counts(['2026-09-30', '2026-09-27']), '2026-10-01').streak).toBe(1)
  })
  it('is zero with no activity', () => {
    expect(forgivingStreak(new Map(), '2026-10-01').streak).toBe(0)
  })
})

describe('momentum', () => {
  it('builds the week, goal progress and a 12 x 7 calendar ending this week', () => {
    const answers = [answer(1, true), answer(2, true), answer(3, false)] // Wed, Tue, Mon
    const m = momentum(answers, NOW)
    expect(m.weekDaysDone).toBe(3)
    expect(m.weeklyGoal).toBe(4)
    expect(m.week.map((d) => d.isToday)).toEqual([false, false, false, true, false, false, false])
    expect(m.calendar).toHaveLength(12)
    expect(m.calendar[0].cells).toHaveLength(7)
    expect(m.calendar[11].label).toBe('Sep 28')
    expect(m.calendar[11].cells[3].isToday).toBe(true)
    expect(m.calendar[11].cells[4].isFuture).toBe(true)
    expect(m.calendar[11].cells[2].level).toBe(1)
    expect(m.streak).toBe(3)
  })
})

describe('missedQuestions', () => {
  const questions = [Q('a', 'Rink', ['1.1']), Q('b', 'Puck'), Q('c', 'Puck')]
  it('lists questions still being missed, worst first', () => {
    const answers = [
      answer(5, false, 'a', 's1'),
      answer(4, false, 'a', 's2'),
      answer(3, false, 'a', 's3'),
      answer(5, false, 'b', 's1'),
      answer(2, false, 'b', 's4'),
    ]
    const r = missedQuestions(answers, questions)
    expect(r.map((x) => [x.questionId, x.misses])).toEqual([['a', 3], ['b', 2]])
    expect(r[0].lastSessionId).toBe('s3')
    expect(r[0].rule).toBe('1.1')
  })
  it('drops a question once it has been answered correctly since', () => {
    const answers = [answer(5, false, 'a'), answer(4, false, 'a'), answer(1, true, 'a')]
    expect(missedQuestions(answers, questions)).toEqual([])
  })
  it('ignores single misses', () => {
    expect(missedQuestions([answer(1, false, 'a')], questions)).toEqual([])
  })
})

describe('milestones', () => {
  it('awards question-count badges and points at the next one', () => {
    const answers = Array.from({ length: 120 }, (_, i) => answer(60 - i * 0.4, true))
    const m = milestones(answers, [])
    expect(m.earned.map((b) => b.id)).toContain('q100')
    expect(m.next).toEqual({ title: '250 questions', current: 120, target: 250 })
  })
  it('finds the best week only when it has enough answers', () => {
    expect(milestones(many(3, 5, 1), []).earned.some((b) => b.id === 'best-week')).toBe(false)
    const m = milestones(many(3, 19, 1), [])
    expect(m.earned.find((b) => b.id === 'best-week')?.title).toBe('Best week: 95%')
  })
  it('lists mastered topics', () => {
    const m = milestones([], [M('Rink', 0.9, 10, 1)])
    expect(m.earned.map((b) => b.title)).toEqual(['Rink mastered'])
  })
})
