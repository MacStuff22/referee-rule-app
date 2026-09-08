'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Script from 'next/script'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useTurnstile, captchaConfigured } from '@/hooks/useTurnstile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

const GENERIC_SENT_MESSAGE = "If an account exists for that email, a reset link is on its way."

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [supabase] = useState(() => createClient())
  const { captchaToken, containerRef, onScriptLoad, reset } = useTurnstile()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/reset-password`,
      captchaToken,
    })

    setLoading(false)

    // Never reveal whether an account exists for this email — that applies
    // to a "no such user" outcome just as much as a real send, so only a
    // captcha-specific failure gets its own message; everything else
    // (including success) shows the same generic confirmation.
    if (error?.code === 'captcha_failed') {
      setError('Verification failed — please complete the checkbox again and resubmit.')
      reset()
      return
    }

    setSubmitted(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      {captchaConfigured && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          onLoad={onScriptLoad}
        />
      )}
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>Enter your email and we&apos;ll send you a reset link</CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <Alert>
              <AlertDescription>{GENERIC_SENT_MESSAGE}</AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              {captchaConfigured && <div ref={containerRef} />}
              <Button
                type="submit"
                className="w-full"
                disabled={loading || (captchaConfigured && !captchaToken)}
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </Button>
            </form>
          )}
          <p className="text-center text-sm mt-4">
            <Link href="/login" className="text-gray-600 underline hover:text-gray-900">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
