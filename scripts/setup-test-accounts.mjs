/**
 * One-time setup: creates two permanent, clearly-fake test accounts so Claude
 * (or Morgan) can log in during testing without ever touching a real invited
 * user's account. Safe to re-run — skips accounts that already exist.
 *
 * Usage:
 *   node --env-file=.env.local scripts/setup-test-accounts.mjs
 *
 * See CLAUDE.md ("Testing as a logged-in user") for how these accounts get used.
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const TEST_ACCOUNTS = [
  { email: 'claude-test-user@referee-rule-app.test', full_name: 'Claude Test User', role: 'user' },
  { email: 'claude-test-admin@referee-rule-app.test', full_name: 'Claude Test Admin', role: 'admin' },
]

async function findExistingUserByEmail(email) {
  // Small, invite-only user base — a single page comfortably covers everyone.
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null
}

async function ensureTestAccount({ email, full_name, role }) {
  let user = await findExistingUserByEmail(email)

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name },
    })
    if (error) throw error
    user = data.user
    console.log(`Created ${email} (${user.id})`)
  } else {
    console.log(`Already exists: ${email} (${user.id})`)
  }

  if (role === 'admin') {
    const { error } = await supabase.from('profiles').update({ role: 'admin' }).eq('id', user.id)
    if (error) throw error
    console.log('  -> role set to admin')
  }
}

for (const account of TEST_ACCOUNTS) {
  await ensureTestAccount(account)
}

console.log('\nDone. Generate a login link any time with:')
console.log('  node --env-file=.env.local scripts/get-test-login-link.mjs user')
console.log('  node --env-file=.env.local scripts/get-test-login-link.mjs admin')
