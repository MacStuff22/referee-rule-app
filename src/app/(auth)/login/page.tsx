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

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [supabase] = useState(() => createClient())
  const { captchaToken, containerRef, onScriptLoad, reset } = useTurnstile()

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
      reset()
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
          onLoad={onScriptLoad}
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
            {captchaConfigured && <div ref={containerRef} />}
            <Button
              type="submit"
              className="w-full"
              disabled={loading || (captchaConfigured && !captchaToken)}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="text-center text-sm mt-4">
            <Link href="/forgot-password" className="text-gray-600 underline hover:text-gray-900">
              Forgot your password?
            </Link>
          </p>
          <p className="text-center text-sm text-gray-500 mt-2">
            Access is by invitation only.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
