export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LinkButton } from '@/components/ui/link-button'
import { Confetti } from '@/components/paths/confetti'
import { getPathAnswers } from '@/lib/quiz/pathProgress'
import { buildPathReport, describeTiming } from '@/lib/quiz/pathReport'
import { getRequestTimeZone } from '@/lib/requestTimeZone'
import type { QuizPath } from '@/types'

interface Props {
  params: Promise<{ pathId: string }>
}

/** The moment right after a Study Plan's last question. Short on purpose: one number, one sentence, one button. */
export default async function PathFinishPage({ params }: Props) {
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
  // Only a finished plan has a finish line.
  if (typedPath.status !== 'completed') redirect(`/paths/${pathId}`)

  // The numbers are a bonus: if they can't load, the celebration still shows.
  let covered: number | null = null
  let timingLine: string | null = null
  try {
    const answers = await getPathAnswers(supabase, pathId, user.id)
    const report = buildPathReport({
      answers,
      categoryByQuestionId: new Map(),
      targetEndDate: new Date(typedPath.target_end_date),
      timeZone: await getRequestTimeZone(),
    })
    covered = report.questionsCovered
    timingLine = report.timing ? describeTiming(report.timing) : null
  } catch (err) {
    console.error('Failed to load the plan finish summary:', err instanceof Error ? err.message : err)
  }

  return (
    <div className="max-w-xl mx-auto text-center space-y-6 pt-6">
      <Confetti />

      <div
        aria-hidden="true"
        className="mx-auto flex size-24 items-center justify-center rounded-full bg-amber-100 text-5xl ring-4 ring-amber-300"
      >
        🏆
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-amber-600">Study plan complete</p>
        <h1 className="text-3xl font-bold text-gray-900">You finished your study plan!</h1>
        <p className="text-gray-500">{typedPath.name}</p>
        {covered !== null && (
          <p className="text-lg text-gray-700">
            {`All ${covered} question${covered === 1 ? '' : 's'} covered. That's real work — well done.`}
          </p>
        )}
        {timingLine && <p className="text-sm text-gray-500">{timingLine}</p>}
      </div>

      {/* Reserved for the next pass: the ranked highlights (accuracy, longest streak, questions covered, study days, finishing early). */}

      <div className="space-y-2 pt-2">
        <LinkButton href={`/paths/${pathId}/report`} size="lg" className="w-full">See how you did</LinkButton>
        <LinkButton href="/dashboard" variant="ghost" className="w-full">Skip to dashboard</LinkButton>
      </div>
    </div>
  )
}
