'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface SetPasswordFormProps {
  title: string
  description: string
  submitLabel: string
  loadingLabel: string
}

export function SetPasswordForm({ title, description, submitLabel, loadingLabel }: SetPasswordFormProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  // Password-reset links carry a PKCE `?code=` param that must be explicitly
  // exchanged for a session. Invite links carry an implicit hash token that
  // Supabase auto-detects instead, so there's nothing to do when no code is
  // present in the URL.
  const [verifying, setVerifying] = useState(false)
  const [linkError, setLinkError] = useState('')

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')
    if (!code) return

    // Entering the loading state immediately, before the async exchange
    // starts, is correct here — not the render-derivable value the rule
    // otherwise guards against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVerifying(true)
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      setVerifying(false)
      if (error) {
        setLinkError('This link is invalid or has expired. Please request a new one.')
      }
    })
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    setError('')

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center text-gray-500">Verifying link…</CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {linkError ? (
            <Alert variant="destructive">
              <AlertDescription>{linkError}</AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? loadingLabel : submitLabel}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
