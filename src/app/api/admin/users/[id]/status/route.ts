import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { friendlyAuthError } from '@/lib/supabase/errorMessage'
import { NextResponse } from 'next/server'

// A duration long enough to function as a permanent ban; 'none' lifts it.
const BAN_DURATION = '87600h'

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

  const { action } = await request.json()
  if (action !== 'deactivate' && action !== 'reactivate') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  if (id === user.id && action === 'deactivate') {
    return NextResponse.json({ error: "You can't deactivate yourself." }, { status: 400 })
  }

  const adminSupabase = createAdminClient()

  const { error } = await adminSupabase.auth.admin.updateUserById(id, {
    ban_duration: action === 'deactivate' ? BAN_DURATION : 'none',
  })

  if (error) {
    return NextResponse.json({ error: friendlyAuthError(error) }, { status: 400 })
  }

  await adminSupabase.from('admin_audit_log').insert({
    actor_id: user.id,
    target_user_id: id,
    action: 'status_change',
    details: { action },
  })

  return NextResponse.json({ success: true })
}
