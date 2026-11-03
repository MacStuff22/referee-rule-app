export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestTimeZone } from '@/lib/requestTimeZone'
import { buildUserRows, summarizeUsers } from '@/lib/adminUsers'
import { Alert, AlertDescription } from '@/components/ui/alert'
import InviteDialog from '@/components/admin/invite-dialog'
import RetryButton from '@/components/admin/retry-button'
import UsersClient from '@/components/admin/users-client'
import type { Profile } from '@/types'

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()

  const adminSupabase = createAdminClient()

  const [profilesResult, authResult, timeZone] = await Promise.all([
    // Newest first: someone you just invited lands at the top, not below the fold.
    adminSupabase.from('profiles').select('*').order('created_at', { ascending: false }),
    // Supabase hands back 50 people per page unless told otherwise, and each
    // person's pending / deactivated status comes from this list. Ask for up to
    // 1,000 (far more than this app will have); paging past that isn't handled.
    adminSupabase.auth.admin.listUsers({ perPage: 1000 }),
    getRequestTimeZone(),
  ])

  // Either lookup failing means we can't tell who is deactivated, so say so
  // rather than show an empty list or everyone as active.
  const loadFailed = Boolean(profilesResult.error || authResult.error)
  const rows = loadFailed
    ? []
    : buildUserRows((profilesResult.data ?? []) as Profile[], authResult.data.users, new Date(), timeZone)

  return (
    <div className="space-y-6">
      {/* Two columns: title and summary on the left, the Invite button on the right. The button's
          "Invitation sent" line is a second grid item that spans both columns underneath. */}
      <div className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          {!loadFailed && <p className="mt-1 text-sm text-muted-foreground">{summarizeUsers(rows)}</p>}
        </div>
        <InviteDialog />
      </div>

      {loadFailed ? (
        <div className="space-y-3">
          <Alert variant="destructive">
            <AlertDescription>Couldn’t load users. Try again.</AlertDescription>
          </Alert>
          <RetryButton />
        </div>
      ) : (
        <UsersClient rows={rows} currentUserId={currentUser?.id ?? null} />
      )}
    </div>
  )
}
