export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LinkButton } from '@/components/ui/link-button'
import { getPathProgress, PACE_LABEL, type PathProgress } from '@/lib/quiz/pathProgress'
import { describeDue, formatPlanDate, POOL_LABEL } from '@/lib/quiz/pathLabels'
import { localDateString } from '@/lib/quiz/paths'
import { getRequestTimeZone } from '@/lib/requestTimeZone'
import { cn } from '@/lib/utils'
import type { QuizPath } from '@/types'

interface PlanWithProgress {
  path: QuizPath
  progress: PathProgress
}

const planSubtitle = (path: QuizPath) =>
  `${POOL_LABEL[path.pool_filter.type] ?? 'Custom'} · ${path.days_per_week} day${path.days_per_week === 1 ? '' : 's'}/week`

function ActivePlanCard({ path, progress, today }: PlanWithProgress & { today: string }) {
  const due = describeDue(path.target_end_date, today)
  const pace = PACE_LABEL[progress.paceStatus]
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-gray-900">{path.name}</h3>
            <p className="text-xs text-gray-500">{planSubtitle(path)}</p>
          </div>
          <p className="shrink-0 text-2xl font-bold text-gray-900">{progress.percent}%</p>
        </div>

        <div>
          <div className="relative h-3 w-full rounded-full bg-gray-100">
            <div className="h-3 rounded-full bg-slate-900" style={{ width: `${progress.percent}%` }} />
            <div
              className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-amber-500"
              style={{ left: `${progress.expectedPercent}%` }}
              title={`Expected by today: ${progress.expectedCount} of ${progress.poolSize}`}
            />
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            {progress.coveredCount} of {progress.poolSize} questions covered · even pace is {progress.expectedCount} by today
          </p>
        </div>

        {path.status === 'active' ? <Badge variant={pace.variant}>{pace.label}</Badge> : <Badge variant="secondary">{path.status}</Badge>}

        <div className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-sm">
          <div>
            <p className="text-xs text-gray-500">Today&apos;s quiz</p>
            <p className="font-medium text-gray-900">
              {progress.todaysQuestions} question{progress.todaysQuestions === 1 ? '' : 's'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Due {formatPlanDate(path.target_end_date)}</p>
            <p className={cn('font-medium', due.tone === 'late' ? 'text-red-600' : due.tone === 'soon' ? 'text-amber-600' : 'text-gray-900')}>
              {due.text}
            </p>
          </div>
        </div>

        <LinkButton href={`/paths/${path.id}`} size="lg" className="w-full">
          {path.status === 'active' ? 'Open plan' : 'View plan'}
        </LinkButton>
      </CardContent>
    </Card>
  )
}

function CompletedPlanCard({ path, progress }: PlanWithProgress) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"
          >
            ✓
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-gray-900">{path.name}</h3>
            <p className="text-xs text-gray-500">{planSubtitle(path)}</p>
            <p className="text-xs text-gray-500">
              {progress.coveredCount} of {progress.poolSize} questions · due {formatPlanDate(path.target_end_date)}
            </p>
          </div>
        </div>
        <LinkButton href={`/paths/${path.id}/report`} variant="outline" className="w-full">View report</LinkButton>
      </CardContent>
    </Card>
  )
}

export default async function PathsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: paths } = await supabase
    .from('quiz_paths')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const timeZone = await getRequestTimeZone()
  const now = new Date()
  const today = localDateString(now, timeZone)
  const withProgress: PlanWithProgress[] = await Promise.all(
    ((paths ?? []) as QuizPath[]).map(async (path) => ({ path, progress: await getPathProgress(supabase, path, now, timeZone) }))
  )

  // What you're working on up top, what's done underneath.
  const inProgress = withProgress.filter((p) => p.path.status !== 'completed')
  const completed = withProgress.filter((p) => p.path.status === 'completed')

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Study Plans</h1>
          <p className="text-gray-500 text-sm mt-1">Pace yourself toward covering a set of questions by a deadline.</p>
        </div>
        <LinkButton href="/paths/new" className="shrink-0">Create a Plan</LinkButton>
      </div>

      {withProgress.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-gray-500">
            <p className="text-lg font-medium">No study plans yet</p>
            <p className="text-sm mt-1">Create a plan to work through the Situation Book (or a category subset) by a deadline.</p>
            <LinkButton href="/paths/new" className="mt-4">Create a Plan</LinkButton>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              In progress
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium normal-case tracking-normal text-gray-700">
                {inProgress.length}
              </span>
            </h2>
            {inProgress.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  <p className="font-medium text-gray-900">Nothing in progress</p>
                  <p className="text-sm mt-1">Start a new plan, or open a report below to retake what you missed.</p>
                  <LinkButton href="/paths/new" className="mt-4">Create a Plan</LinkButton>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {inProgress.map((p) => (
                  <ActivePlanCard key={p.path.id} {...p} today={today} />
                ))}
              </div>
            )}
          </section>

          {completed.length > 0 && (
            <section className="space-y-3 border-t border-gray-200 pt-6">
              <h2 className="flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Completed
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium normal-case tracking-normal text-gray-700">
                  {completed.length}
                </span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {completed.map((p) => (
                  <CompletedPlanCard key={p.path.id} {...p} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
