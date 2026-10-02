import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PACE_LABEL, type PathProgress } from '@/lib/quiz/pathProgress'
import type { QuizPath } from '@/types'
import { SectionHeading } from './primitives'

export function PlanPace({ plans }: { plans: { path: QuizPath; progress: PathProgress }[] }) {
  return (
    <section className="min-w-0 space-y-3">
      <SectionHeading number={10} title="Study Plan Pace">
        A deadline turned into a daily target.
      </SectionHeading>
      <Card>
        <CardContent className="space-y-5">
          {plans.map(({ path, progress }) => (
            <div key={path.id} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/paths/${path.id}`} className="font-semibold text-gray-900 hover:underline">
                  {path.name}
                </Link>
                <Badge variant={PACE_LABEL[progress.paceStatus].variant}>{PACE_LABEL[progress.paceStatus].label}</Badge>
              </div>
              <div className="relative mt-6 h-3 w-full rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-slate-900" style={{ width: `${progress.percent}%` }} />
                <div
                  className="absolute -top-1.5 -bottom-1.5 w-[3px] rounded bg-amber-500"
                  style={{ left: `${progress.expectedPercent}%` }}
                />
                <span
                  className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-amber-700"
                  style={{ left: `${Math.min(Math.max(progress.expectedPercent, 12), 88)}%` }}
                >
                  Where you should be
                </span>
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-xs text-gray-500">
                <span>{progress.percent}% covered ({progress.coveredCount} of {progress.poolSize})</span>
                <span>
                  Finish by {new Date(`${path.target_end_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ·{' '}
                  {path.questions_per_day} questions a day
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}
