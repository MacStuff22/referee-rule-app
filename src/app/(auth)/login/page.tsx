'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          'expired-callback'?: () => void
        }
      ) => string
      reset: (widgetId?: string) => void
    }
  }
}

// Unset in local/dev environments that haven't configured a Turnstile site —
// the form still works, it just doesn't require a captcha token.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
const captchaConfigured = Boolean(TURNSTILE_SITE_KEY)

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [supabase] = useState(() => createClient())

  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaScriptLoaded, setCaptchaScriptLoaded] = useState(false)
  const turnstileContainerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string>(undefined)

  useEffect(() => {
    if (!captchaScriptLoaded || !turnstileContainerRef.current || widgetIdRef.current || !window.turnstile) {
      return
    }

    widgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
      sitekey: TURNSTILE_SITE_KEY!,
      callback: setCaptchaToken,
      'expired-callback': () => setCaptchaToken(''),
    })
  }, [captchaScriptLoaded])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    })

    if (error) {
      setError('Invalid email or password.')
      setLoading(false)
      setCaptchaToken('')
      window.turnstile?.reset(widgetIdRef.current)
      return
    }

    window.location.href = '/dashboard'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      {captchaConfigured && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          onLoad={() => setCaptchaScriptLoaded(true)}
        />
      )}
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Hockey Officials</CardTitle>
          <CardDescription>Rule Study Tool — Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
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
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {captchaConfigured && <div ref={turnstileContainerRef} />}
            <Button
              type="submit"
              className="w-full"
              disabled={loading || (captchaConfigured && !captchaToken)}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            Access is by invitation only.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
