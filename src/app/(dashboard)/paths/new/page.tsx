export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NewPathForm, type RetakeSource } from '@/components/paths/new-path-form'
import { loadStillMissed } from '@/lib/quiz/pathMissed'

interface Props {
  searchParams: Promise<{ retakeFrom?: string }>
}

export default async function NewPathPage({ searchParams }: Props) {
  const { retakeFrom } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // "Retake what you missed" on a finished plan's report opens this page pre-filled.
  // Anything that doesn't check out (someone else's plan, an unfinished one,
  // nothing missed, a load failure) simply gives the ordinary form.
  let retake: RetakeSource | null = null
  if (typeof retakeFrom === 'string' && retakeFrom) {
    try {
      const { data: source } = await supabase
        .from('quiz_paths')
        .select('id, name, status, pool_question_ids')
        .eq('id', retakeFrom)
        .eq('user_id', user.id)
        .maybeSingle()
      if (source?.status === 'completed') {
        const { missed } = await loadStillMissed(supabase, source, user.id)
        if (missed.length > 0) retake = { sourcePathId: source.id, sourceName: source.name, missedCount: missed.length }
      }
    } catch (err) {
      console.error('Failed to prepare the retake plan:', err instanceof Error ? err.message : err)
    }
  }

  return <NewPathForm retake={retake} />
}
