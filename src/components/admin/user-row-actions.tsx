'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { EllipsisIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import ConfirmActionDialog from '@/components/admin/confirm-action-dialog'
import type { UserStatus } from '@/lib/adminUsers'
import { postJson } from '@/lib/postJson'
import type { UserRole } from '@/types'

type RowAction = 'promote' | 'demote' | 'deactivate' | 'reactivate'

// All the wording for the four actions lives here, not scattered through the JSX.
const ACTIONS: Record<
  RowAction,
  {
    menuLabel: string
    title: (who: string) => string
    description: (who: string) => string
    confirmLabel: string
    confirmingLabel: string
    done: (who: string) => string
    tone: 'default' | 'destructive'
    request: (userId: string) => { url: string; body: Record<string, string> }
  }
> = {
  promote: {
    menuLabel: 'Make Admin',
    title: (who) => `Make ${who} an admin?`,
    description: () =>
      'Admins can edit questions, manage matches, invite and deactivate people, and see everyone’s analytics. You can remove admin access later.',
    confirmLabel: 'Make Admin',
    confirmingLabel: 'Making admin…',
    done: (who) => `${who} is now an admin.`,
    tone: 'default',
    request: (userId) => ({ url: `/api/admin/users/${userId}/role`, body: { role: 'admin' } }),
  },
  demote: {
    menuLabel: 'Remove Admin',
    title: (who) => `Remove admin access for ${who}?`,
    description: (who) =>
      `${who} becomes a regular user and loses access to the admin tabs. Their quiz history and study plans are kept. You can make them an admin again later.`,
    confirmLabel: 'Remove Admin',
    confirmingLabel: 'Removing…',
    done: (who) => `${who} is now a regular user.`,
    tone: 'default',
    request: (userId) => ({ url: `/api/admin/users/${userId}/role`, body: { role: 'user' } }),
  },
  deactivate: {
    menuLabel: 'Deactivate',
    title: (who) => `Deactivate ${who}?`,
    description: (who) =>
      `${who} won’t be able to sign in. Their quiz history is kept, and you can reactivate them at any time.`,
    confirmLabel: 'Deactivate',
    confirmingLabel: 'Deactivating…',
    done: (who) => `${who} is deactivated.`,
    tone: 'destructive',
    request: (userId) => ({ url: `/api/admin/users/${userId}/status`, body: { action: 'deactivate' } }),
  },
  reactivate: {
    menuLabel: 'Reactivate',
    title: (who) => `Reactivate ${who}?`,
    description: (who) => `${who} will be able to sign in again.`,
    confirmLabel: 'Reactivate',
    confirmingLabel: 'Reactivating…',
    done: (who) => `${who} is reactivated.`,
    tone: 'default',
    request: (userId) => ({ url: `/api/admin/users/${userId}/status`, body: { action: 'reactivate' } }),
  },
}

interface UserRowActionsProps {
  userId: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
}

// The signed-in admin's own row never renders this: you can't change your own role or deactivate yourself.
export default function UserRowActions({ userId, name, email, role, status }: UserRowActionsProps) {
  const router = useRouter()
  const triggerId = useId()
  const who = name || email

  const [isRefreshing, startRefresh] = useTransition()
  const [action, setAction] = useState<RowAction>('deactivate')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [justResent, setJustResent] = useState(false)

  // Busy until the request is done AND the refreshed list has arrived; before, the old state showed with live buttons.
  const busy = submitting || isRefreshing
  const roleAction: RowAction = role === 'admin' ? 'demote' : 'promote'

  // The confirmation line fades after a few seconds.
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  // Supabase limits how many invite emails go out per hour, so the resend button rests for a minute.
  useEffect(() => {
    if (!justResent) return
    const timer = setTimeout(() => setJustResent(false), 60_000)
    return () => clearTimeout(timer)
  }, [justResent])

  function openDialog(next: RowAction) {
    setError('')
    setAction(next)
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setError('')
  }

  async function confirmAction() {
    const { request, done } = ACTIONS[action]
    const { url, body } = request(userId)
    setSubmitting(true)
    setError('')
    const result = await postJson(url, body)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setDialogOpen(false)
    setNotice(done(who))
    startRefresh(() => router.refresh())
  }

  async function resendInvitation() {
    setSubmitting(true)
    setError('')
    // Leave the name out when there isn't one, so the re-invite can't blank it.
    const result = await postJson('/api/admin/invite', name ? { email, full_name: name } : { email })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setNotice(`Invitation re-sent to ${email}.`)
    setJustResent(true)
  }

  const copy = ACTIONS[action]

  return (
    // whitespace-normal: table cells don't wrap, but the notice and error lines below the buttons must.
    <div className="flex flex-col items-end whitespace-normal">
      <div className="flex items-center gap-2">
        {status === 'pending' && (
          <Button variant="outline" size="sm" onClick={resendInvitation} disabled={busy || justResent}>
            {submitting && !dialogOpen ? 'Sending…' : justResent ? 'Invitation Sent' : 'Resend Invitation'}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            id={triggerId}
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label={`Actions for ${who}`}
                className="pointer-coarse:size-11"
              />
            }
          >
            <EllipsisIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-44">
            <DropdownMenuItem disabled={busy} onClick={() => openDialog(roleAction)}>
              {ACTIONS[roleAction].menuLabel}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {status === 'deactivated' ? (
              <DropdownMenuItem disabled={busy} onClick={() => openDialog('reactivate')}>
                {ACTIONS.reactivate.menuLabel}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem variant="destructive" disabled={busy} onClick={() => openDialog('deactivate')}>
                {ACTIONS.deactivate.menuLabel}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Always in the page, so screen readers announce what appears in it. */}
      <p role="status" className={notice ? 'mt-1.5 max-w-56 text-right text-xs text-muted-foreground' : 'sr-only'}>
        {notice}
      </p>

      {!dialogOpen && error && (
        <Alert variant="destructive" className="mt-1.5 max-w-56 px-2.5 py-1.5">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <ConfirmActionDialog
        open={dialogOpen}
        onOpenChange={(next) => (next ? setDialogOpen(true) : closeDialog())}
        title={copy.title(who)}
        description={copy.description(who)}
        confirmLabel={copy.confirmLabel}
        confirmingLabel={copy.confirmingLabel}
        tone={copy.tone}
        confirming={submitting}
        error={dialogOpen ? error : ''}
        returnFocusId={triggerId}
        onConfirm={confirmAction}
      />
    </div>
  )
}
