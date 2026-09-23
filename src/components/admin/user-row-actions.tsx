'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { UserRole } from '@/types'

interface UserRowActionsProps {
  userId: string
  role: UserRole
  banned: boolean
  isSelf: boolean
}

export default function UserRowActions({ userId, role, banned, isSelf }: UserRowActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function post(url: string, body: Record<string, string>, confirmMessage: string) {
    if (!confirm(confirmMessage)) return

    setLoading(true)
    setError('')

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.error)
    }

    setLoading(false)
  }

  function toggleRole() {
    const nextRole = role === 'admin' ? 'user' : 'admin'
    post(
      `/api/admin/users/${userId}/role`,
      { role: nextRole },
      nextRole === 'admin' ? 'Promote this user to admin?' : 'Demote this admin to a regular user?'
    )
  }

  function toggleStatus() {
    const nextAction = banned ? 'reactivate' : 'deactivate'
    post(
      `/api/admin/users/${userId}/status`,
      { action: nextAction },
      nextAction === 'deactivate'
        ? 'Deactivate this user? They will no longer be able to sign in.'
        : 'Reactivate this user?'
    )
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleRole}
          disabled={loading || isSelf}
          title={isSelf ? "You can't change your own role" : undefined}
        >
          {role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleStatus}
          disabled={loading || isSelf}
          title={isSelf ? "You can't deactivate yourself" : undefined}
        >
          {banned ? 'Reactivate' : 'Deactivate'}
        </Button>
      </div>
      {error && (
        <Alert variant="destructive" className="py-1.5 px-2.5">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
