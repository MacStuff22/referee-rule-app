export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import QuestionForm from '@/components/admin/question-form'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditQuestionPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: question } = await supabase
    .from('questions')
    .select('*')
    .eq('id', id)
    .single()

  if (!question) notFound()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Edit Question</h1>
      <QuestionForm question={question} />
    </div>
  )
}
