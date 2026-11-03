export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { LinkButton } from '@/components/ui/link-button'
import { PracticeButton } from '@/components/dashboard/practice-button'
import { RetakeMissedCard } from '@/components/paths/retake-missed-card'
import { MASTERY_CONFIG } from '@/lib/quiz/mastery'
import { loadStillMissed } from '@/lib/quiz/pathMissed'
import {
  buildPathReport,
  defaultRetakeSize,
  describeTiming,
  nextSteps,
  retakeSizeOptions,
  RETAKE_PLAN_DEFAULTS,
  TIER_LABEL,
  type MissedQuestion,
  type SectionResult,
  type SectionTier,
} from '@/lib/quiz/pathReport'
import { getRequestTimeZone } from '@/lib/requestTimeZone'
import { cn } from '@/lib/utils'
import type { QuizPath } from '@/types'

const BAR_COLOR: Record<SectionTier, string> = {
  strong: 'bg-emerald-500',
  solid: 'bg-slate-500',
  building: 'bg-amber-500',
  unrated: 'bg-gray-300',
}

const RING_COLOR: Record<SectionTier, string> = {
  strong: 'stroke-emerald-500',
  solid: 'stroke-slate-500',
  building: 'stroke-amber-500',
  unrated: 'stroke-gray-300',
}

const percent = (value: number) => `${Math.round(value * 100)}%`

const RING_RADIUS = 46
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/** The overall accuracy as a ring, coloured with the same strong / solid / building lines as the topic bars. */
function AccuracyRing({ accuracy }: { accuracy: number | null }) {
  const tier: SectionTier =
    accuracy === null
      ? 'unrated'
      : accuracy >= MASTERY_CONFIG.masteredFloor
        ? 'strong'
        : accuracy >= MASTERY_CONFIG.developingCeiling
          ? 'solid'
          : 'building'
  const filled = (accuracy ?? 0) * RING_CIRCUMFERENCE
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 112 112"
      role="img"
      aria-label={accuracy === null ? 'No answers' : `${percent(accuracy)} answered correctly`}
      className="shrink-0"
    >
      <circle cx="56" cy="56" r={RING_RADIUS} fill="none" strokeWidth="10" className="stroke-gray-100" />
      <circle
        cx="56"
        cy="56"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${RING_CIRCUMFERENCE}`}
        transform="rotate(-90 56 56)"
        className={RING_COLOR[tier]}
      />
      <text x="56" y="56" textAnchor="middle" fontSize="24" fontWeight="700" className="fill-gray-900">
        {accuracy === null ? '—' : percent(accuracy)}
      </text>
      <text x="56" y="74" textAnchor="middle" fontSize="11" className="fill-gray-500">
        correct
      </text>
    </svg>
  )
}

function ActionCard({
  icon,
  title,
  description,
  primary,
  children,
}: {
  icon: string
  title: string
  description: string
  primary: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-xl bg-white p-4', primary ? 'border-2 border-slate-900' : 'border border-gray-200')}>
      <span className="text-2xl" aria-hidden="true">{icon}</span>
      <div className="flex-1">
        <p className="font-medium text-gray-900">{title}</p>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      {children}
    </div>
  )
}

function TopicRow({ section, focus }: { section: SectionResult; focus: boolean }) {
  return (
    <div className={cn('rounded-lg px-3 py-2', focus && 'border border-amber-200 bg-amber-50')}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-gray-900">
          {section.section}
          {focus && <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-amber-800">Focus</span>}
        </span>
        <span className="shrink-0 text-gray-500">
          {section.accuracy === null
            ? `${TIER_LABEL.unrated} (${section.answered} answered)`
            : `${percent(section.accuracy)} · ${TIER_LABEL[section.tier]}`}
        </span>
      </div>
      <div className={cn('mt-1.5 h-2 w-full rounded-full', focus ? 'bg-white' : 'bg-gray-100')}>
        <div
          className={cn('h-2 rounded-full', BAR_COLOR[section.tier])}
          style={{ width: `${section.accuracy === null ? 0 : Math.round(section.accuracy * 100)}%` }}
        />
      </div>
    </div>
  )
}

interface Props {
  params: Promise<{ pathId: string }>
}

export default async function PathReportPage({ params }: Props) {
  const { pathId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: path } = await supabase
    .from('quiz_paths')
    .select('*')
    .eq('id', pathId)
    .eq('user_id', user.id)
    .single()

  if (!path) redirect('/paths')
  const typedPath = path as QuizPath
  // The report is for a finished plan; an unfinished one is still on its plan page.
  if (typedPath.status !== 'completed') redirect(`/paths/${pathId}`)

  const timeZone = await getRequestTimeZone()

  // Everything the report needs, including which questions are still missed.
  // The retake is an extra, but it shares these queries, so a failure here is
  // a failed report rather than a half-empty one.
  let loaded
  try {
    loaded = await loadStillMissed(supabase, typedPath, user.id)
  } catch (err) {
    console.error('Failed to load the plan report:', err instanceof Error ? err.message : err)
    return (
      <div className="max-w-2xl mx-auto space-y-4 text-center pt-10">
        <h1 className="text-2xl font-bold text-gray-900">We couldn&apos;t load your report</h1>
        <p className="text-gray-500">Your answers are saved — this is a display problem. Please try again in a moment.</p>
        <LinkButton href={`/paths/${pathId}`} variant="outline">Back to the plan</LinkButton>
      </div>
    )
  }
  const { liveQuestions, planAnswers } = loaded
  const missed: MissedQuestion[] = loaded.missed

  const report = buildPathReport({
    answers: planAnswers,
    categoryByQuestionId: new Map(liveQuestions.map((q) => [q.id, q.category])),
    targetEndDate: new Date(typedPath.target_end_date),
    timeZone,
  })

  const steps = nextSteps(missed.length, report.focusSections)
  const retakeOptions = retakeSizeOptions(missed.length)
  const retakePrimary = steps.retake === 'primary'

  // A retake plan is made in a new tab, so a second click shouldn't make a second plan.
  let existingRetakePlanId: string | null = null
  if (steps.retakeFormat === 'plan') {
    try {
      const { data: existing } = await supabase
        .from('quiz_paths')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .contains('pool_filter', { type: 'missed_questions', sourcePathId: pathId })
        .limit(1)
        .maybeSingle()
      existingRetakePlanId = existing?.id ?? null
    } catch (err) {
      console.error('Failed to look for an existing retake plan:', err instanceof Error ? err.message : err)
    }
  }

  const focusNames = new Set(report.focusSections.map((s) => s.section))
  const ratedSections = report.sections.filter((s) => s.accuracy !== null).sort((a, b) => b.accuracy! - a.accuracy!)
  const unratedSections = report.sections.filter((s) => s.accuracy === null)

  const timingTone = report.timing?.kind === 'late' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'

  let retakeCard: React.ReactNode = null
  if (steps.retakeFormat === 'plan') {
    retakeCard = (
      <ActionCard
        key="retake"
        icon="🔁"
        title="Retake what you missed"
        description={
          existingRetakePlanId
            ? 'You already have a retake plan going for these questions.'
            : `Set up a study plan of the ${missed.length} questions you got wrong: ${RETAKE_PLAN_DEFAULTS.questionsPerDay} a session, ${RETAKE_PLAN_DEFAULTS.daysPerWeek} days a week, starting today.`
        }
        primary={retakePrimary}
      >
        {existingRetakePlanId ? (
          <LinkButton href={`/paths/${existingRetakePlanId}`} size="lg" variant={retakePrimary ? 'default' : 'outline'} className="w-full">
            Open your retake plan
          </LinkButton>
        ) : (
          <Link
            href={`/paths/new?retakeFrom=${pathId}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: 'lg', variant: retakePrimary ? 'default' : 'outline' }), 'w-full')}
          >
            Set up retake plan ↗
          </Link>
        )}
      </ActionCard>
    )
  } else if (steps.retakeFormat === 'quiz') {
    retakeCard = (
      <RetakeMissedCard
        key="retake"
        pathId={pathId}
        missedCount={missed.length}
        sizeOptions={retakeOptions}
        defaultSize={defaultRetakeSize(retakeOptions)}
        primary={retakePrimary}
      />
    )
  }

  const practiceCard = (
    <ActionCard
      key="practice"
      icon="🎯"
      title={steps.practice === 'weakest' ? 'Practice your weakest topics' : 'Keep your edge with a mixed quiz'}
      description={
        steps.practice === 'weakest'
          ? `A 17-question quiz on ${steps.practiceSections.join(' and ')}.`
          : 'A 17-question quiz across everything, leaning toward what needs a refresh.'
      }
      primary={!retakePrimary}
    >
      <PracticeButton
        categories={steps.practiceCategories}
        sessionLength="standard"
        variant={retakePrimary ? 'outline' : 'default'}
        size="lg"
        fullWidth
      >
        {steps.practice === 'weakest' ? 'Practice these questions now' : 'Start a mixed quiz'}
      </PracticeButton>
    </ActionCard>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-5 py-5 sm:flex-row">
          <AccuracyRing accuracy={report.accuracy} />
          <div className="flex-1 space-y-3 text-center sm:text-left">
            <div>
              <p className="text-sm text-gray-500">Study plan report</p>
              <h1 className="text-xl font-bold text-gray-900">{typedPath.name}</h1>
            </div>
            {report.timing && (
              <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-medium', timingTone)}>
                {describeTiming(report.timing)}
              </span>
            )}
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              <div className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm">
                <span className="font-semibold text-gray-900">{report.questionsCovered}</span>{' '}
                <span className="text-xs text-gray-500">questions</span>
              </div>
              <div className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm">
                <span className="font-semibold text-gray-900">{report.studyDays}</span>{' '}
                <span className="text-xs text-gray-500">study day{report.studyDays === 1 ? '' : 's'}</span>
              </div>
              {missed.length > 0 && (
                <div className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm">
                  <span className="font-semibold text-gray-900">{missed.length}</span>{' '}
                  <span className="text-xs text-gray-500">to revisit</span>
                </div>
              )}
            </div>
            {report.trend && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                📈 You got sharper as you went: {report.trend.from}% in the first half of the plan, {report.trend.to}% in the second.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {report.sections.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <CardTitle>How you did by topic</CardTitle>
              <p className="flex flex-wrap gap-x-3 text-xs text-gray-500">
                <span><span className="text-emerald-500">●</span> Strong 85%+</span>
                <span><span className="text-slate-500">●</span> Solid 65%+</span>
                <span><span className="text-amber-500">●</span> Building</span>
              </p>
            </div>
            {focusNames.size > 0 && (
              <p className="text-sm text-gray-500">The highlighted topics are where a little more practice will pay off most.</p>
            )}
          </CardHeader>
          <CardContent className="space-y-1">
            {[...ratedSections, ...unratedSections].map((s) => (
              <TopicRow key={s.section} section={s} focus={focusNames.has(s.section)} />
            ))}
            {focusNames.size === 0 && ratedSections.length > 0 && (
              <p className="px-3 pt-2 text-sm text-emerald-800">Every topic we could rate came in at 85% or better. That&apos;s a strong finish.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="font-semibold text-gray-800">What&apos;s next</h2>
        {steps.retake === 'none' && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Clean sweep — you got every question right the last time you saw it. Nothing to retake.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">{retakePrimary ? [retakeCard, practiceCard] : [practiceCard, retakeCard]}</div>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 pt-1 text-sm text-gray-500">
          <Link href="/paths/new" className="underline underline-offset-4">Start a new plan</Link>
          <Link href="/dashboard" className="underline underline-offset-4">Back to dashboard</Link>
          {report.finalSessionId && (
            <Link href={`/quiz/${report.finalSessionId}/results`} className="underline underline-offset-4">
              Review the answers from your last quiz
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
