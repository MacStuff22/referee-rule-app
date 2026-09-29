'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Public landing page for scripts/get-test-login-link.mjs. /dashboard and
// /admin are gated server-side (proxy.ts + their layouts) before any
// client-side JS runs, so a magic-link redirect straight to one of those
// bounces to /login before the browser ever gets a chance to read the
// #access_token= hash out of the URL. Landing here first — a public route,
// same trust model as /accept-invite and /reset-password — lets Supabase's
// browser client consume the hash and set real session cookies, then we
// hand off to the real destination once a session actually exists.
export default function TestLoginPage() {
  const [status, setStatus] = useState('Signing in…')

  useEffect(() => {
    const supabase = createClient()
    const next = new URLSearchParams(window.location.search).get('next') || '/dashboard'

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.location.href = next
      } else {
        setStatus('No session found — the link may have expired or already been used.')
      }
    })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <p className="text-gray-600">{status}</p>
    </div>
  )
}
