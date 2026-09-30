/**
 * Prints a one-time login link for one of the fixed test accounts, using
 * Supabase's Admin API (generateLink) — the same service-role mechanism the
 * invite flow already uses (src/app/api/admin/invite/route.ts), which never
 * goes through the Turnstile CAPTCHA on the real /login page. Open the
 * printed link directly in a browser to land already signed in.
 *
 * Usage:
 *   node --env-file=.env.local scripts/get-test-login-link.mjs user [redirectTo]
 *   node --env-file=.env.local scripts/get-test-login-link.mjs admin [redirectTo]
 *
 * Run scripts/setup-test-accounts.mjs first if the accounts don't exist yet.
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const EMAILS = {
  user: 'claude-test-user@referee-rule-app.test',
  admin: 'claude-test-admin@referee-rule-app.test',
}

const [, , which, redirectToArg] = process.argv
const email = EMAILS[which]

if (!email) {
  console.error('Usage: node scripts/get-test-login-link.mjs <user|admin> [redirectTo]')
  process.exit(1)
}

// /dashboard and /admin are gated server-side, so rather than following
// Supabase's hosted redirect link (which round-trips through the Supabase
// domain and hands back a raw bearer token), we take the one-time
// verification hash straight to our own public /test-login page, which
// exchanges it for a real session via a same-origin verifyOtp() call. See
// src/app/(auth)/test-login/page.tsx.
const destination = redirectToArg ?? (which === 'admin' ? '/admin/questions' : '/dashboard')

const { data, error } = await supabase.auth.admin.generateLink({
  type: 'magiclink',
  email,
})

if (error) {
  console.error(error.message)
  process.exit(1)
}

const params = new URLSearchParams({ token_hash: data.properties.hashed_token, next: destination })
console.log(`http://localhost:3000/test-login?${params}`)
