export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestTimeZone } from '@/lib/requestTimeZone'
import { HISTORY_LIMIT, buildAuditLines, type AuditEntry } from '@/lib/adminAudit'
import { buildUserRows, summarizeUsers } from '@/lib/adminUsers'
import { Alert, AlertDescription } from '@/components/ui/alert'
import InviteDialog from '@/components/admin/invite-dialog'
import RecentChanges from '@/components/admin/recent-changes'
import RetryButton from '@/components/admin/retry-button'
import UsersClient from '@/components/admin/users-client'
import type { Profile } from '@/types'

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()

  const adminSupabase = createAdminClient()

  const [profilesResult, authResult, auditResult, timeZone] = await Promise.all([
    // Newest first: someone you just invited lands at the top, not below the fold.
    adminSupabase.from('profiles').select('*').order('created_at', { ascending: false }),
    // Supabase hands back 50 people per page unless told otherwise, and each
    // person's pending / deactivated status comes from this list. Ask for up to
    // 1,000 (far more than this app will have); paging past that isn't handled.
    adminSupabase.auth.admin.listUsers({ perPage: 1000 }),
    // The change history is an extra, so it is its own query and its failure
    // only shows as a note under the list; it can never take the user list down.
    adminSupabase.from('admin_audit_log').select('*').order('created_at', { ascending: false }).limit(HISTORY_LIMIT),
    getRequestTimeZone(),
  ])

  // Either lookup failing means we can't tell who is deactivated, so say so
  // rather than show an empty list or everyone as active.
  const loadFailed = Boolean(profilesResult.error || authResult.error)
  const now = new Date()
  const profiles = (profilesResult.data ?? []) as Profile[]
  const rows = loadFailed ? [] : buildUserRows(profiles, authResult.data.users, now, timeZone)
  const history = auditResult.error
    ? null
    : buildAuditLines((auditResult.data ?? []) as AuditEntry[], profiles, currentUser?.id ?? null, timeZone, now)

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
        <>
          <UsersClient rows={rows} currentUserId={currentUser?.id ?? null} />
          <RecentChanges lines={history} />
        </>
      )}
    </div>
  )
}
