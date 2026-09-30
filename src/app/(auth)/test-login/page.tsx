'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Public landing page for scripts/get-test-login-link.mjs. /dashboard and
// /admin are gated server-side (proxy.ts + their layouts), so this page takes
// a one-time verification hash (from Supabase's admin generateLink API) as a
// query param and exchanges it for a real session via verifyOtp() — a plain
// same-origin API call, never a redirect through Supabase's own domain and
// never a raw bearer token passed around. Same trust model as /accept-invite
// and /reset-password: public, but does nothing without a valid token.
export default function TestLoginPage() {
  const [status, setStatus] = useState('Signing in…')

  useEffect(() => {
    const supabase = createClient()
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const next = params.get('next') || '/dashboard'

    if (!tokenHash) {
      setStatus('Missing token.')
      return
    }

    supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' }).then(({ error }) => {
      if (error) {
        setStatus(`Sign-in failed: ${error.message}`)
      } else {
        window.location.href = next
      }
    })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <p className="text-gray-600">{status}</p>
    </div>
  )
}
