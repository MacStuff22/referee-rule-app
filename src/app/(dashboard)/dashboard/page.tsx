export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LinkButton } from '@/components/ui/link-button'
import { getAnsweredQuestionIds } from '@/lib/quiz/performance'
import { classifyMastery, type MasteryStatus } from '@/lib/quiz/mastery'
import { CATEGORIES } from '@/lib/constants'

const STATUS_LABEL: Record<MasteryStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  new: { label: 'New', variant: 'outline' },
  learning: { label: 'Learning', variant: 'outline' },
  developing: { label: 'Developing', variant: 'destructive' },
  proficient: { label: 'Proficient', variant: 'secondary' },
  mastered: { label: 'Mastered', variant: 'default' },
}

const STATUS_ORDER: MasteryStatus[] = ['developing', 'learning', 'proficient', 'mastered', 'new']

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: masteryRows } = await supabase
    .from('user_category_mastery')
    .select('category, ema_score, total_answered')
    .eq('user_id', user.id)

  const categories = (masteryRows ?? [])
    .map((r) => ({
      category: r.category as string,
      status: classifyMastery(r.total_answered, r.ema_score),
      totalAnswered: r.total_answered as number,
    }))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))

  const [{ count: approvedCount }, answeredIds] = await Promise.all([
    supabase.from('questions').select('id', { count: 'exact', head: true }).eq('is_approved', true),
    getAnsweredQuestionIds(supabase, user.id),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {profile?.full_name}</h1>
          <p className="text-gray-500 text-sm mt-1">Ready to study some rules?</p>
        </div>
        <LinkButton href="/quiz">Start a Quiz</LinkButton>
      </div>

      <Card>
        <CardContent className="py-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <p className="text-gray-400">Categories touched</p>
            <p className="font-semibold text-gray-900">{categories.length} of {CATEGORIES.length}</p>
          </div>
          <div>
            <p className="text-gray-400">Questions answered at least once</p>
            <p className="font-semibold text-gray-900">{answeredIds.size} of {approvedCount ?? 0}</p>
          </div>
        </CardContent>
      </Card>

      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-gray-500">
            <p className="text-lg font-medium">No quiz history yet</p>
            <p className="text-sm mt-1">Take your first quiz to see your performance by category.</p>
            <LinkButton href="/quiz" className="mt-4">Take a Quiz</LinkButton>
          </CardContent>
        </Card>
      ) : (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Performance by Category</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {categories.map((c) => (
              <Card key={c.category}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{c.category}</CardTitle>
                    <Badge variant={STATUS_LABEL[c.status].variant}>{STATUS_LABEL[c.status].label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-xs text-gray-400">{c.totalAnswered} questions answered</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
