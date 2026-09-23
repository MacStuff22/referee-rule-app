export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import InviteForm from '@/components/admin/invite-form'
import UserRowActions from '@/components/admin/user-row-actions'
import type { Profile } from '@/types'

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()

  const adminSupabase = createAdminClient()

  const [{ data: users }, { data: authList }] = await Promise.all([
    adminSupabase.from('profiles').select('*').order('created_at'),
    adminSupabase.auth.admin.listUsers(),
  ])

  const bannedIds = new Set(
    (authList?.users ?? [])
      .filter((u) => u.banned_until && new Date(u.banned_until) > new Date())
      .map((u) => u.id)
  )

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
          <CardTitle>All Users ({users?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!users?.length ? (
            <p className="text-sm text-gray-500">No users found.</p>
          ) : (
            <div className="divide-y">
              {(users as Profile[]).map((u) => (
                <div key={u.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{u.full_name || '(no name)'}</p>
                    <p className="text-sm text-gray-500">{u.email}</p>
                    <div className="flex gap-1.5 mt-1">
                      <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                        {u.role}
                      </Badge>
                      {bannedIds.has(u.id) && <Badge variant="destructive">deactivated</Badge>}
                    </div>
                  </div>
                  <UserRowActions
                    userId={u.id}
                    role={u.role}
                    banned={bannedIds.has(u.id)}
                    isSelf={u.id === currentUser?.id}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
