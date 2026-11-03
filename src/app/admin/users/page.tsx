export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestTimeZone } from '@/lib/requestTimeZone'
import { buildUserRows, formatShortDate } from '@/lib/adminUsers'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import InviteForm from '@/components/admin/invite-form'
import RetryButton from '@/components/admin/retry-button'
import UserRowActions from '@/components/admin/user-row-actions'
import UserStatusBadge from '@/components/admin/user-status-badge'
import type { Profile } from '@/types'

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()

  const adminSupabase = createAdminClient()

  const [profilesResult, authResult, timeZone] = await Promise.all([
    adminSupabase.from('profiles').select('*').order('created_at'),
    // Supabase hands back 50 people per page unless told otherwise, and each
    // person's pending / deactivated status comes from this list. Ask for up to
    // 1,000 (far more than this app will have); paging past that isn't handled.
    adminSupabase.auth.admin.listUsers({ perPage: 1000 }),
    getRequestTimeZone(),
  ])

  // Either lookup failing means we can't tell who is deactivated, so say so
  // rather than show an empty list or everyone as active.
  const loadFailed = Boolean(profilesResult.error || authResult.error)
  const now = new Date()
  const rows = loadFailed ? [] : buildUserRows((profilesResult.data ?? []) as Profile[], authResult.data.users, now)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Users</h1>

      <Card>
        <CardHeader>
          <CardTitle>Invite a New User</CardTitle>
        </CardHeader>
        <CardContent>
          <InviteForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{loadFailed ? 'All Users' : `All Users (${rows.length})`}</CardTitle>
        </CardHeader>
        <CardContent>
          {loadFailed ? (
            <div className="space-y-3">
              <Alert variant="destructive">
                <AlertDescription>Couldn’t load users. Try again.</AlertDescription>
              </Alert>
              <RetryButton />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500">No users found.</p>
          ) : (
            <div className="divide-y">
              {rows.map((u) => {
                const isSelf = u.id === currentUser?.id
                return (
                  <div key={u.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{u.name || '(no name)'}</p>
                      <p className="truncate text-sm text-gray-500">{u.email}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                          {u.role === 'admin' ? 'Admin' : 'User'}
                        </Badge>
                        <UserStatusBadge status={u.status} />
                        {isSelf && <Badge variant="outline">You</Badge>}
                        {u.status === 'pending' && u.invitedAt && (
                          <span className="text-xs text-gray-500">
                            Invited <time dateTime={u.invitedAt}>{formatShortDate(u.invitedAt, timeZone, now)}</time>
                          </span>
                        )}
                      </div>
                    </div>
                    {!isSelf && (
                      <UserRowActions userId={u.id} name={u.name} email={u.email} role={u.role} status={u.status} />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
