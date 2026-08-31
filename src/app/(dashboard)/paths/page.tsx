export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LinkButton } from '@/components/ui/link-button'
import { getPathProgress } from '@/lib/quiz/pathProgress'
import type { QuizPath } from '@/types'

const PACE_LABEL: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  ahead: { label: 'Ahead of pace', variant: 'default' },
  'on-track': { label: 'On track', variant: 'secondary' },
  behind: { label: 'Behind pace', variant: 'destructive' },
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

  const withProgress = await Promise.all(
    ((paths ?? []) as QuizPath[]).map(async (path) => ({ path, progress: await getPathProgress(supabase, path) }))
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Study Plans</h1>
          <p className="text-gray-500 text-sm mt-1">Pace yourself toward covering a set of questions by a deadline.</p>
        </div>
        <LinkButton href="/paths/new">Create a Plan</LinkButton>
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
        <div className="grid gap-4 sm:grid-cols-2">
          {withProgress.map(({ path, progress }) => (
            <Card key={path.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{path.name}</CardTitle>
                  {path.status === 'active' ? (
                    <Badge variant={PACE_LABEL[progress.paceStatus].variant}>{PACE_LABEL[progress.paceStatus].label}</Badge>
                  ) : (
                    <Badge variant="secondary">{path.status}</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-slate-900" style={{ width: `${progress.percent}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {progress.coveredCount} of {progress.poolSize} questions covered · target {new Date(path.target_end_date).toLocaleDateString()}
                  </p>
                </div>
                <LinkButton href={`/paths/${path.id}`} variant="outline" className="w-full">View Plan</LinkButton>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
