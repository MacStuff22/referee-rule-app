export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import TestQuizClient from '@/components/admin/test-quiz-client'

export default async function TestQuizPage() {
  const supabase = await createClient()

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('is_approved', true)
    .order('category')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Test Quiz</h1>
        <p className="text-sm text-gray-500">Admin-only — preview the quiz exactly as an end user sees it.</p>
      </div>

      <TestQuizClient questions={questions ?? []} />
    </div>
  )
}
