import { cn } from '@/lib/utils'
import type { DashboardData } from '@/lib/dashboard/data'
import { GlanceGrid, type GlanceTileSpec } from './glance-grid'
import { ReadinessDial } from './readiness-dial'
import { ProgressRing } from './progress-ring'
import { TrendChart, TrendSparkline } from './trend-chart'
import { ActivityCalendar } from './activity-calendar'
import { Medal } from './medal'
import { DeltaPill, LabeledBar, NotEnoughData, pct } from './primitives'

function Why({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>
}

function Explain({ what, why }: { what: string; why: string }) {
  return (
    <div className="mb-3 grid gap-1 text-sm text-gray-600 sm:grid-cols-2 sm:gap-6">
      <p><b className="text-gray-900">What you&apos;re seeing:</b> {what}</p>
      <p><b className="text-gray-900">Why it helps:</b> {why}</p>
    </div>
  )
}

export function GlanceTiles({ data }: { data: DashboardData }) {
  const { readiness, last30, trend, coverage, momentum, milestones } = data
  const trendPoints = trend.filter((p) => p.accuracy !== null)
  const firstTrend = trendPoints[0]
  const lastTrend = trendPoints[trendPoints.length - 1]
  const trendGain = firstTrend && lastTrend && trendPoints.length > 1
    ? Math.round((lastTrend.accuracy! - firstTrend.accuracy!) * 100)
    : null

  const tiles: GlanceTileSpec[] = [
    {
      id: 'readiness',
      number: 1,
      title: 'Readiness Score',
      summary: (
        <div className="space-y-2">
          <div className="flex justify-center">
            <ReadinessDial score={readiness.score} size="small" />
          </div>
          <Why>{readiness.score === null ? 'Answer a few more questions to get your score.' : 'Are you ready? One number answers it.'}</Why>
        </div>
      ),
      detail: (
        <div className="space-y-3">
          <Explain
            what="A 0 to 100 score. Red is early days, yellow is building, and green means you're in good shape."
            why="It blends your recent accuracy, how much of the rulebook you've covered, and how fresh your knowledge is."
          />
          <div className="flex flex-wrap items-center gap-6">
            <div className="min-w-64 flex-1 basis-72">
              <ReadinessDial score={readiness.score} />
            </div>
            <div className="min-w-56 flex-1 basis-64 space-y-3">
              {readiness.score === null ? (
                <NotEnoughData>Your score appears once you have {10} answers in the last 30 days.</NotEnoughData>
              ) : (
                <>
                  <LabeledBar label="Recent accuracy (30 days)" value={readiness.accuracy ?? 0} display={pct(readiness.accuracy)} tone="good" />
                  <LabeledBar label="Rulebook covered (90 days)" value={readiness.coverage} display={pct(readiness.coverage)} />
                  <LabeledBar label="Knowledge freshness" value={readiness.freshness ?? 0} display={pct(readiness.freshness)} tone="warn" />
                  {readiness.staleTopics > 0 && (
                    <p className="text-sm text-gray-500">
                      Biggest thing holding you back: {readiness.staleTopics} topic{readiness.staleTopics === 1 ? '' : 's'} you haven&apos;t practiced in a while.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'last30',
      number: 2,
      title: 'Last 30 Days',
      summary: (
        <div className="space-y-2">
          {last30.current.accuracy === null ? (
            <NotEnoughData>Answer {Math.max(0, 10 - last30.current.total)} more questions to see your 30-day accuracy.</NotEnoughData>
          ) : (
            <>
              <div className="flex items-end gap-3">
                <span className="text-4xl font-bold tabular-nums text-gray-900">{pct(last30.current.accuracy)}</span>
                <DeltaPill points={last30.deltaPoints} />
              </div>
              <p className="text-sm text-gray-500">{last30.current.total} questions answered</p>
            </>
          )}
          <Why>Are you getting better lately?</Why>
        </div>
      ),
      detail: (
        <div className="space-y-3">
          <Explain
            what="Your accuracy over the last 30 days next to the 30 days before."
            why="A recent window keeps old mistakes from hiding today's progress."
          />
          {last30.current.accuracy === null ? (
            <NotEnoughData>You need at least 10 answers in the last 30 days.</NotEnoughData>
          ) : (
            <div className="flex flex-wrap items-start gap-8">
              <div className="space-y-2">
                <div className="text-5xl font-bold tabular-nums text-gray-900">{pct(last30.current.accuracy)}</div>
                <DeltaPill points={last30.deltaPoints} suffix=" vs. the previous 30 days" />
              </div>
              <div className="min-w-56 flex-1 space-y-3">
                <LabeledBar label="Last 30 days" value={last30.current.accuracy} display={pct(last30.current.accuracy)} tone="good" />
                <LabeledBar label="Previous 30 days" value={last30.previous.accuracy ?? 0} display={pct(last30.previous.accuracy)} tone="soft" />
                <p className="text-sm text-gray-500">
                  {last30.current.total} questions answered
                  {last30.previous.total > 0 ? ` (previous 30 days: ${last30.previous.total})` : ''}
                </p>
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'trend',
      number: 3,
      title: 'Progress Over Time',
      summary: (
        <div className="space-y-2">
          {trendPoints.length < 2 ? (
            <NotEnoughData>Your trend appears after a few weeks of studying.</NotEnoughData>
          ) : (
            <>
              <TrendSparkline points={trend} />
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-lg text-gray-900">{pct(firstTrend.accuracy)} → {pct(lastTrend.accuracy)}</b>
                <DeltaPill points={trendGain} />
              </div>
            </>
          )}
          <Why>Your climb, one point every two weeks.</Why>
        </div>
      ),
      detail: (
        <div className="space-y-3">
          <Explain
            what="Your accuracy every two weeks, with a goal line and the change between points."
            why="A trend tells you more than any single score, and a dip shows up early."
          />
          <TrendChart points={trend} />
        </div>
      ),
    },
    {
      id: 'coverage',
      number: 6,
      title: 'Rulebook Coverage',
      summary: (
        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold tabular-nums text-gray-900">
              {coverage.totalQuestions ? pct(coverage.seenRolling / coverage.totalQuestions) : '—'}
            </span>
            <span className="pb-1 text-sm text-gray-500">seen in the last 90 days</span>
          </div>
          <p className="text-sm text-gray-500">All time: {coverage.totalQuestions ? pct(coverage.seenAllTime / coverage.totalQuestions) : '—'}</p>
          <Why>How much of the book is fresh in your mind?</Why>
        </div>
      ),
      detail: (
        <div className="space-y-3">
          <Explain
            what="How much of the rulebook and Situation Handbook you've practiced. The main number is the last 90 days, with all time underneath."
            why="A rule you saw once last spring shouldn't count as covered."
          />
          <div className="flex flex-wrap items-center gap-6">
            <ProgressRing value={coverage.totalQuestions ? coverage.seenRolling / coverage.totalQuestions : 0} label="Share of questions seen in the last 90 days" />
            <div className="min-w-56 flex-1 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Last 90 days</p>
              <LabeledBar label="Questions practiced" value={coverage.totalQuestions ? coverage.seenRolling / coverage.totalQuestions : 0} display={`${coverage.seenRolling} of ${coverage.totalQuestions}`} />
              <LabeledBar label="Topics practiced" value={coverage.totalTopics ? coverage.topicsRolling / coverage.totalTopics : 0} display={`${coverage.topicsRolling} of ${coverage.totalTopics}`} />
              <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">All time</p>
              <LabeledBar label="Questions ever seen" value={coverage.totalQuestions ? coverage.seenAllTime / coverage.totalQuestions : 0} display={`${coverage.seenAllTime} of ${coverage.totalQuestions}`} tone="soft" />
              <LabeledBar label="Topics mastered" value={coverage.totalTopics ? coverage.topicsMastered / coverage.totalTopics : 0} display={`${coverage.topicsMastered} of ${coverage.totalTopics}`} tone="good" />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'momentum',
      number: 7,
      title: 'Momentum & Habit',
      summary: (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tabular-nums text-gray-900">{momentum.streak}</span>
            <span className="text-gray-500">day streak</span>
          </div>
          <WeekDots week={momentum.week} />
          <p className="text-sm text-gray-500">
            {momentum.weekDaysDone} of {momentum.weeklyGoal} study days this week
          </p>
          <Why>Are you studying a little, often?</Why>
        </div>
      ),
      detail: (
        <div className="space-y-3">
          <Explain
            what="A weekly goal, a forgiving streak, and a calendar of the last 12 weeks."
            why="Short, regular sessions beat cramming. Any quiz counts, and one missed day a week won't break your streak."
          />
          <div className="flex flex-wrap items-start gap-8">
            <div className="space-y-3">
              <div className="text-5xl font-bold tabular-nums text-gray-900">
                {momentum.streak} <span className="text-lg font-semibold text-gray-500">day streak</span>
              </div>
              {momentum.restDayUsed && (
                <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-semibold text-amber-800">
                  A rest day was forgiven this week
                </span>
              )}
              <div>
                <p className="mb-1 text-sm font-semibold text-gray-900">
                  This week: {momentum.weekDaysDone} of {momentum.weeklyGoal} study days
                </p>
                <WeekDots week={momentum.week} />
              </div>
            </div>
            <div className="min-w-72 flex-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Last 12 weeks</p>
              <ActivityCalendar weeks={momentum.calendar} />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'milestones',
      number: 9,
      title: 'Milestones & Wins',
      summary: (
        <div className="space-y-2">
          {milestones.earned.length === 0 ? (
            <p className="text-sm text-gray-600">Your first badge is {milestones.next?.target ?? 100} questions away.</p>
          ) : (
            <div className="flex gap-2">
              {milestones.earned.slice(0, 5).map((b) => (
                <span key={b.id} title={b.title}>
                  <Medal badge={b} size="sm" />
                </span>
              ))}
            </div>
          )}
          <p className="text-sm text-gray-500">
            {milestones.earned.length} earned
            {milestones.next ? ` · next: ${milestones.next.title} (${milestones.next.current} so far)` : ''}
          </p>
          <Why>Small wins that keep studying rewarding.</Why>
        </div>
      ),
      detail: (
        <div className="space-y-3">
          <Explain
            what="Badges for real achievements. You're only ever compared with your past self."
            why="Small wins keep studying rewarding."
          />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {milestones.earned.map((b) => (
              <li key={b.id} className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 p-4 text-center">
                <Medal badge={b} />
                <p className="font-semibold text-gray-900">{b.title}</p>
                <p className="text-sm text-gray-500">{b.detail}</p>
              </li>
            ))}
            {milestones.next && (
              <li className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 p-4 text-center">
                <Medal badge={{ kind: 'questions', target: milestones.next.target }} locked />
                <p className="font-semibold text-gray-900">{milestones.next.title}</p>
                <p className="text-sm text-gray-500">{milestones.next.target - milestones.next.current} to go</p>
              </li>
            )}
          </ul>
        </div>
      ),
    },
  ]

  return <GlanceGrid tiles={tiles} />
}

function WeekDots({ week }: { week: DashboardData['momentum']['week'] }) {
  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  return (
    <div className="flex gap-1.5" role="img" aria-label="Study days this week">
      {week.map((d, i) => (
        <span
          key={d.key}
          className={cn(
            'flex size-7 items-center justify-center rounded-full border-2 text-xs font-bold',
            d.done ? 'border-green-600 bg-green-600 text-white' : d.isToday ? 'border-slate-900 text-slate-900' : 'border-gray-200 text-gray-400'
          )}
        >
          {letters[i]}
        </span>
      ))}
    </div>
  )
}
