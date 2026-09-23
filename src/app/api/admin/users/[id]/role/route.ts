import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { friendlyAuthError } from '@/lib/supabase/errorMessage'
import { NextResponse } from 'next/server'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { role } = await request.json()
  if (role !== 'admin' && role !== 'user') {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  if (id === user.id && role === 'user') {
    return NextResponse.json({ error: "You can't demote yourself." }, { status: 400 })
  }

  const adminSupabase = createAdminClient()

  const { data: target } = await adminSupabase
    .from('profiles')
    .select('role')
    .eq('id', id)
    .single()

  const { error } = await adminSupabase.from('profiles').update({ role }).eq('id', id)

  if (error) {
    return NextResponse.json({ error: friendlyAuthError(error) }, { status: 400 })
  }

  await adminSupabase.from('admin_audit_log').insert({
    actor_id: user.id,
    target_user_id: id,
    action: 'role_change',
    details: { from: target?.role ?? null, to: role },
  })

  return NextResponse.json({ success: true })
}
