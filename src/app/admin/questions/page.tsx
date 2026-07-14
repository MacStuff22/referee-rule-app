export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { LinkButton } from '@/components/ui/link-button'
import QuestionsClient from '@/components/admin/questions-client'

export default async function QuestionsPage() {
  const supabase = await createClient()

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Questions</h1>
        <LinkButton href="/admin/questions/new">+ Add Question</LinkButton>
      </div>

      <Suspense fallback={<div className="text-sm text-gray-500 py-8 text-center">Loading…</div>}>
        <QuestionsClient questions={questions ?? []} />
      </Suspense>
    </div>
  )
}
