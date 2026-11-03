'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { postJson } from '@/lib/postJson'

// The Invite button and its pop-up. It returns the button and the "Invitation
// sent" line as two separate pieces on purpose: the page header is a
// two-column grid, so the button lands top right and the line drops full width
// underneath it.
export default function InviteDialog() {
  const router = useRouter()
  const [, startRefresh] = useTransition()
  const emailRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  // An error about the email itself sits under that field; anything else sits above the buttons.
  const [emailError, setEmailError] = useState('')
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 10_000)
    return () => clearTimeout(timer)
  }, [notice])

  function handleOpenChange(next: boolean) {
    // While the invitation is going out, Escape or a click outside must not hide the result.
    if (sending) return
    setOpen(next)
    if (next) {
      setNotice('')
    } else {
      setName('')
      setEmail('')
      setEmailError('')
      setFormError('')
    }
  }

  async function sendInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSending(true)
    setEmailError('')
    setFormError('')

    const cleanName = name.trim()
    const cleanEmail = email.trim()
    const result = await postJson('/api/admin/invite', { email: cleanEmail, full_name: cleanName })
    setSending(false)

    if (!result.ok) {
      // 409 is "this email already has an account": about the Email field, so say it there and go there.
      if (result.status === 409) {
        setEmailError(result.message)
        emailRef.current?.focus()
      } else {
        setFormError(result.message)
      }
      return
    }

    setOpen(false)
    setName('')
    setEmail('')
    setNotice(`Invitation sent to ${cleanEmail}. They’ll get an email with a link to set a password.`)
    startRefresh(() => router.refresh())
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger render={<Button />}>Invite Someone</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite someone</DialogTitle>
            <DialogDescription>They’ll get an email with a link to set a password.</DialogDescription>
          </DialogHeader>
          <form onSubmit={sendInvite} className="grid gap-4">
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="invite-name">Full Name</Label>
              {/* Unusual field names and autoComplete off: otherwise the browser offers *your own* name and email here. */}
              <Input
                id="invite-name"
                name="invitee_name"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                ref={emailRef}
                id="invite-email"
                name="invitee_email"
                type="email"
                autoComplete="off"
                spellCheck={false}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  // The error was about the old address; don't leave it on a corrected one.
                  setEmailError('')
                }}
                placeholder="jane@example.com"
                required
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? 'invite-email-error' : undefined}
              />
              {emailError && (
                <p id="invite-email-error" role="alert" className="text-sm text-destructive">
                  {emailError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={sending} onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={sending}>
                {sending ? 'Sending…' : 'Send Invitation'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Always in the page, so screen readers announce what appears in it. */}
      <p
        role="status"
        className={notice ? 'col-span-full rounded-lg border bg-muted/50 px-3 py-2 text-sm text-foreground' : 'sr-only'}
      >
        {notice}
      </p>
    </>
  )
}
