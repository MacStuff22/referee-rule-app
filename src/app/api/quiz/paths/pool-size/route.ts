import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { resolvePool } from '@/lib/quiz/pool'
import type { PathPoolFilter } from '@/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { poolFilter }: { poolFilter: PathPoolFilter } = await request.json()
  if (!poolFilter) return NextResponse.json({ error: 'poolFilter is required' }, { status: 400 })

  const { questionIds } = await resolvePool(supabase, user.id, poolFilter)
  return NextResponse.json({ poolSize: questionIds.length })
}
