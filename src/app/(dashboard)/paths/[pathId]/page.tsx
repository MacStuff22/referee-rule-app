export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LinkButton } from '@/components/ui/link-button'
import { getPathProgress } from '@/lib/quiz/pathProgress'
import { StartPathSessionButton } from '@/components/quiz/start-path-session-button'
import type { QuizPath } from '@/types'

const PACE_LABEL: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  ahead: { label: 'Ahead of pace', variant: 'default' },
  'on-track': { label: 'On track', variant: 'secondary' },
  behind: { label: 'Behind pace', variant: 'destructive' },
}

const POOL_LABEL: Record<string, string> = {
  situation_book: 'Situation Book',
  categories: 'Selected Rules',
  weak_areas: 'Weaknesses',
}

interface Props {
  params: Promise<{ pathId: string }>
}

export default async function PathDetailPage({ params }: Props) {
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
  const progress = await getPathProgress(supabase, typedPath)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{typedPath.name}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {POOL_LABEL[typedPath.pool_filter.type]} · {typedPath.days_per_week} day{typedPath.days_per_week === 1 ? '' : 's'}/week
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Progress</CardTitle>
          {typedPath.status === 'active' ? (
            <Badge variant={PACE_LABEL[progress.paceStatus].variant}>{PACE_LABEL[progress.paceStatus].label}</Badge>
          ) : (
            <Badge variant="secondary">{typedPath.status}</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div className="h-3 rounded-full bg-slate-900" style={{ width: `${progress.percent}%` }} />
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {progress.coveredCount} of {progress.poolSize} questions covered ({progress.percent}%)
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-400">Target finish</p>
              <p className="font-medium text-gray-900">{new Date(typedPath.target_end_date).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-gray-400">Current pace</p>
              <p className="font-medium text-gray-900">{typedPath.questions_per_day} questions/day</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {typedPath.status === 'completed' ? (
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <p className="text-lg font-medium text-gray-900">Plan complete! 🎉</p>
            <p className="text-sm text-gray-500">Every question in this plan&apos;s pool has been covered.</p>
            <LinkButton href="/paths">Back to Study Plans</LinkButton>
          </CardContent>
        </Card>
      ) : (
        <StartPathSessionButton pathId={typedPath.id} questionsPerDay={typedPath.questions_per_day} />
      )}

      <LinkButton href="/paths" variant="outline" className="w-full">Back to Study Plans</LinkButton>
    </div>
  )
}
