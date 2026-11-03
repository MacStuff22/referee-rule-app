import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { PoolRequestError, resolvePathPool } from '@/lib/quiz/pathMissed'
import type { PathPoolFilter } from '@/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { poolFilter }: { poolFilter: PathPoolFilter } = await request.json()
  if (!poolFilter) return NextResponse.json({ error: 'poolFilter is required' }, { status: 400 })

  try {
    const { questionIds } = await resolvePathPool(supabase, user.id, poolFilter)
    return NextResponse.json({ poolSize: questionIds.length })
  } catch (err) {
    if (err instanceof PoolRequestError) return NextResponse.json({ error: err.message }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not size this plan.' }, { status: 500 })
  }
}
