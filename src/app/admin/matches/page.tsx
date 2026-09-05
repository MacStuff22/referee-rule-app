export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import MatchesClient from '@/components/admin/matches-client'

export default async function MatchesPage() {
  const supabase = await createClient()

  const { data: matches } = await supabase
    .from('situation_matches')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Matches</h1>
      </div>
      <p className="text-sm text-gray-500">
        Situations that duplicate or closely relate to each other. Exact matches get an auto-update option when
        edited; very similar and similar concept matches only prompt for manual review.
      </p>

      <MatchesClient matches={matches ?? []} />
    </div>
  )
}
