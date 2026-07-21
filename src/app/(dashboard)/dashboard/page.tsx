export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LinkButton } from '@/components/ui/link-button'
import { getCategoryScores } from '@/lib/quiz/performance'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Performance per category (shared with the adaptive quiz builder)
  const categoryScores = await getCategoryScores(supabase, user.id)

  const categories = Object.entries(categoryScores)
    .map(([cat, stats]) => ({
      category: cat,
      percentage: Math.round((stats.correct / stats.total) * 100),
      total: stats.total,
    }))
    .sort((a, b) => a.percentage - b.percentage)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {profile?.full_name}</h1>
          <p className="text-gray-500 text-sm mt-1">Ready to study some rules?</p>
        </div>
        <LinkButton href="/quiz">Start a Quiz</LinkButton>
      </div>

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
                    <Badge
                      variant={c.percentage >= 80 ? 'default' : c.percentage >= 60 ? 'secondary' : 'destructive'}
                    >
                      {c.percentage}%
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        c.percentage >= 80 ? 'bg-green-500' : c.percentage >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${c.percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{c.total} questions answered</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
