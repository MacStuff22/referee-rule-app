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

  // Admin-only source notes for video questions (RLS: admins only).
  const { data: noteRow } = await supabase
    .from('question_admin_notes')
    .select('notes')
    .eq('question_id', id)
    .maybeSingle()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Edit Question</h1>
      <QuestionForm question={question} initialVideoNotes={noteRow?.notes ?? ''} />
    </div>
  )
}
