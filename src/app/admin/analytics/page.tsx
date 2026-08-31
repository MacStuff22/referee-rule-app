export const dynamic = 'force-dynamic'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { classifyMastery, type MasteryStatus } from '@/lib/quiz/mastery'
import { getPathProgress } from '@/lib/quiz/pathProgress'
import { CATEGORIES } from '@/lib/constants'
import type { Profile, QuizPath } from '@/types'

interface MasteryRow {
  user_id: string
  category: string
  ema_score: number
  total_answered: number
}

export default async function AdminAnalyticsPage() {
  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: users }, { data: masteryRows }, { data: paths }] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('user_category_mastery').select('user_id, category, ema_score, total_answered'),
    supabase.from('quiz_paths').select('*').eq('status', 'active'),
  ])

  const masteryByUser = new Map<string, MasteryRow[]>()
  for (const row of (masteryRows ?? []) as MasteryRow[]) {
    const list = masteryByUser.get(row.user_id) ?? []
    list.push(row)
    masteryByUser.set(row.user_id, list)
  }

  const pathsByUser = new Map<string, QuizPath[]>()
  for (const path of (paths ?? []) as QuizPath[]) {
    const list = pathsByUser.get(path.user_id) ?? []
    list.push(path)
    pathsByUser.set(path.user_id, list)
  }

  const userSummaries = await Promise.all(
    ((users ?? []) as Profile[]).map(async (u) => {
      const rows = (masteryByUser.get(u.id) ?? []).map((r) => ({
        category: r.category,
        status: classifyMastery(r.total_answered, r.ema_score),
      }))

      const counts: Record<MasteryStatus, number> = { new: 0, learning: 0, developing: 0, proficient: 0, mastered: 0 }
      for (const r of rows) counts[r.status]++

      const developing = rows.filter((r) => r.status === 'developing').map((r) => r.category)

      const userPaths = pathsByUser.get(u.id) ?? []
      const pathSummaries = await Promise.all(
        userPaths.map(async (path) => ({ path, progress: await getPathProgress(supabase, path) }))
      )

      return { profile: u, categoriesTouched: rows.length, counts, developing, pathSummaries }
    })
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-500 text-sm mt-1">Where each official stands across the rule book, and their active study plans.</p>
      </div>

      <div className="grid gap-4">
        {userSummaries.map(({ profile, categoriesTouched, counts, developing, pathSummaries }) => (
          <Card key={profile.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{profile.full_name || profile.email}</CardTitle>
                <span className="text-xs text-gray-400">{categoriesTouched} of {CATEGORIES.length} categories touched</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="destructive">{counts.developing} developing</Badge>
                <Badge variant="secondary">{counts.proficient} proficient</Badge>
                <Badge>{counts.mastered} mastered</Badge>
                <Badge variant="outline">{counts.learning} learning</Badge>
              </div>

              {developing.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Currently weak in:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {developing.map((c) => (
                      <Badge key={c} variant="destructive">{c}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {pathSummaries.length > 0 && (
                <div className="pt-2 border-t space-y-1.5">
                  {pathSummaries.map(({ path, progress }) => (
                    <div key={path.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{path.name}</span>
                      <span className="text-gray-400">{progress.percent}% · {progress.paceStatus.replace('-', ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
