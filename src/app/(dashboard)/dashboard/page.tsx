export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { LinkButton } from '@/components/ui/link-button'
import { loadDashboard } from '@/lib/dashboard/data'
import { GlanceTiles } from '@/components/dashboard/glance-tiles'
import { StudyPlan } from '@/components/dashboard/study-plan'
import { StrengthMap } from '@/components/dashboard/strength-map'
import { MissedQuestions } from '@/components/dashboard/missed-questions'
import { PlanPace } from '@/components/dashboard/plan-pace'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, data] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    loadDashboard(supabase, user.id),
  ])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {profile?.full_name}</h1>
          <p className="text-gray-500 text-sm mt-1">Ready to study some rules?</p>
        </div>
        <LinkButton href="/quiz">Start a Quiz</LinkButton>
      </div>

      {!data.hasHistory ? (
        <Card>
          <CardContent className="py-10 text-center text-gray-500">
            <p className="text-lg font-medium">No quiz history yet</p>
            <p className="text-sm mt-1">Take your first quiz and this page will fill in with your score, trend, and what to study next.</p>
            <LinkButton href="/quiz" className="mt-4">Take a Quiz</LinkButton>
          </CardContent>
        </Card>
      ) : (
        <>
          <GlanceTiles data={data} />
          <StudyPlan items={data.studyPlan} />
          <MissedQuestions items={data.missed} />
          {data.plans.length > 0 && <PlanPace plans={data.plans} />}
          <StrengthMap sections={data.strengthMap} />
        </>
      )}
    </div>
  )
}
