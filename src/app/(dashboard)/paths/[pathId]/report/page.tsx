export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LinkButton } from '@/components/ui/link-button'
import { PracticeButton } from '@/components/dashboard/practice-button'
import { RetakeMissedCard } from '@/components/paths/retake-missed-card'
import { shortDate } from '@/lib/dashboard/metrics'
import { fetchLivePoolQuestions } from '@/lib/quiz/pool'
import { getLatestAnswers, getPathAnswers } from '@/lib/quiz/pathProgress'
import { localDateString } from '@/lib/quiz/paths'
import {
  buildPathReport,
  defaultRetakeSize,
  describeTiming,
  nextSteps,
  retakeBestAfter,
  retakeSizeOptions,
  stillMissedQuestions,
  TIER_LABEL,
  type MissedQuestion,
  type SectionTier,
} from '@/lib/quiz/pathReport'
import { getRequestTimeZone } from '@/lib/requestTimeZone'
import type { QuizPath } from '@/types'

const BAR_COLOR: Record<SectionTier, string> = {
  strong: 'bg-emerald-500',
  solid: 'bg-slate-500',
  building: 'bg-amber-500',
  unrated: 'bg-gray-300',
}

const percent = (value: number) => `${Math.round(value * 100)}%`

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

  let liveQuestions
  let answers
  try {
    liveQuestions = await fetchLivePoolQuestions(supabase, typedPath.pool_question_ids)
    answers = await getPathAnswers(supabase, pathId, user.id)
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

  const report = buildPathReport({
    answers,
    categoryByQuestionId: new Map(liveQuestions.map((q) => [q.id, q.category])),
    targetEndDate: new Date(typedPath.target_end_date),
    timeZone,
  })

  // Which questions are still missed only drives the retake; the rest of the report stands without it.
  let missed: MissedQuestion[] | null = null
  try {
    const latestAnswers = await getLatestAnswers(supabase, user.id, liveQuestions.map((q) => q.id))
    missed = stillMissedQuestions({ poolQuestionIds: liveQuestions.map((q) => q.id), latestAnswers, planAnswers: answers })
  } catch (err) {
    console.error('Failed to check missed questions for the plan report:', err instanceof Error ? err.message : err)
  }

  const steps = nextSteps(missed?.length ?? 0, report.focusSections)
  const retakeOptions = retakeSizeOptions(missed?.length ?? 0)
  const bestAfter = report.finishedOn ? retakeBestAfter(report.finishedOn, localDateString(new Date(), timeZone)) : null
  const ratedSections = report.sections.filter((s) => s.accuracy !== null)
  const retakePrimary = steps.retake === 'primary'

  const retakeCard =
    missed && missed.length > 0 ? (
      <RetakeMissedCard
        key="retake"
        pathId={pathId}
        missedCount={missed.length}
        sizeOptions={retakeOptions}
        defaultSize={defaultRetakeSize(retakeOptions)}
        bestAfter={bestAfter ? shortDate(bestAfter) : null}
        primary={retakePrimary}
      />
    ) : null

  const practiceCard = (
    <div key="practice" className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div>
        <p className="font-medium text-gray-900">
          {steps.practice === 'weakest' ? 'Practice your weakest topics' : 'Keep your edge with a mixed quiz'}
        </p>
        <p className="text-sm text-gray-500">
          {steps.practice === 'weakest'
            ? `A 17-question quiz on ${steps.practiceSections.join(' and ')}.`
            : 'A 17-question quiz across everything, leaning toward what needs a refresh.'}
        </p>
      </div>
      <PracticeButton
        categories={steps.practiceCategories}
        sessionLength="standard"
        variant={retakePrimary ? 'outline' : 'default'}
        size="lg"
        fullWidth
      >
        {steps.practice === 'weakest' ? 'Practice these topics' : 'Start a mixed quiz'}
      </PracticeButton>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-gray-500">Study plan report</p>
        <h1 className="text-2xl font-bold text-gray-900">{typedPath.name}</h1>
        {report.timing && <p className="text-gray-600 mt-1">{describeTiming(report.timing)}</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>At a glance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900">{report.accuracy === null ? '—' : percent(report.accuracy)}</p>
              <p className="text-xs text-gray-500">answered correctly</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{report.questionsCovered}</p>
              <p className="text-xs text-gray-500">questions covered</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{report.studyDays}</p>
              <p className="text-xs text-gray-500">study day{report.studyDays === 1 ? '' : 's'}</p>
            </div>
          </div>
          {report.trend && (
            <p className="text-sm text-gray-700 text-center">
              📈 You got sharper as you went: {report.trend.from}% in the first half of the plan, {report.trend.to}% in the second.
            </p>
          )}
        </CardContent>
      </Card>

      {report.sections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>How you did by topic</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.sections.map((s) => (
              <div key={s.section}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-gray-900">{s.section}</span>
                  <span className="shrink-0 text-gray-500">
                    {s.accuracy === null ? TIER_LABEL.unrated : `${percent(s.accuracy)} · ${TIER_LABEL[s.tier]}`}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                  <div
                    className={`h-2 rounded-full ${BAR_COLOR[s.tier]}`}
                    style={{ width: `${s.accuracy === null ? 0 : Math.round(s.accuracy * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {report.focusSections.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Next to sharpen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700">
            <p>A little more practice here will pay off the most:</p>
            <ul className="list-disc pl-5 space-y-1">
              {report.focusSections.map((s) => (
                <li key={s.section}>
                  <span className="font-medium">{s.section}</span> — {percent(s.accuracy!)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        ratedSections.length > 0 && (
          <Card>
            <CardContent className="py-4 text-sm text-gray-700">
              Every topic we could rate came in at 85% or better. That&apos;s a strong finish.
            </CardContent>
          </Card>
        )
      )}

      <div className="space-y-3">
        <h2 className="font-semibold text-gray-800">What&apos;s next</h2>
        {steps.retake === 'none' && missed !== null && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Clean sweep — you got every question right the last time you saw it. Nothing to retake.
          </p>
        )}
        {retakePrimary ? [retakeCard, practiceCard] : [practiceCard, retakeCard]}
        <div className="flex gap-3">
          <LinkButton href="/paths/new" variant="outline" className="flex-1">Start a new plan</LinkButton>
          <LinkButton href="/dashboard" variant="ghost" className="flex-1">Back to dashboard</LinkButton>
        </div>
      </div>

      {report.finalSessionId && (
        <p className="text-center text-sm">
          <Link href={`/quiz/${report.finalSessionId}/results`} className="text-gray-500 underline underline-offset-4">
            Review the answers from your last quiz
          </Link>
        </p>
      )}
    </div>
  )
}
