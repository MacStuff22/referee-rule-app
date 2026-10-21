/**
 * Checks that the live Supabase database has everything this code needs
 * (the contract lives in supabase-required-schema.json).
 *
 * Why it exists: schema changes are applied by hand in the Supabase SQL Editor,
 * but code deploys automatically on every push. Three times now (league
 * constraint, answer-integrity constraint, video questions) code reached
 * production before its SQL did. This check stops that.
 *
 *   npm run build         runs this first. On a Vercel PRODUCTION build a missing
 *                         requirement fails the build, so the last working
 *                         version stays live. Anywhere else it only warns.
 *   npm run check:schema  the same check by hand (--strict: a gap exits 1, and
 *                         "could not check" exits 2 -- never a false PASSED).
 *
 * It needs the helper installed once: supabase-migration-schema-check.sql.
 *
 * Never blocks a deploy because the CHECK itself failed (no credentials,
 * network trouble, Supabase down) -- only because a requirement is definitely
 * missing. Emergency bypass: set SKIP_SCHEMA_CHECK=1.
 */

import { readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import {
  classifyRpcError,
  decide,
  evaluateManifest,
  formatReport,
  isUsableSnapshot,
  shouldEnforce,
  withSelfTest,
} from './lib/schemaCheck.mjs'

// Local runs read .env.local; on Vercel there is no such file and the platform
// provides the variables, so a missing file is expected.
try {
  process.loadEnvFile('.env.local')
} catch {
  /* nothing to load */
}

const mode = shouldEnforce({ env: process.env, argv: process.argv.slice(2) })
const RPC = 'list_schema_objects'

function report(outcome) {
  const decision = decide({ outcome, mode })
  console.log(formatReport({ outcome, decision, mode }))
  return decision.exitCode
}

function clientFor(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
  })
}

async function checkLockdown(url) {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anonKey) return
  try {
    const { error } = await clientFor(url, anonKey).rpc(RPC)
    if (!error) {
      console.log(`WARNING: the helper can be called with the public (anon) key. Re-run supabase-migration-schema-check.sql to lock it down.`)
    } else {
      console.log('Lockdown: OK (the public key cannot call the helper).')
    }
  } catch {
    /* informational only */
  }
}

async function main() {
  if (mode.skip) {
    console.log('SCHEMA CHECK: SKIPPED (SKIP_SCHEMA_CHECK is set) -- remove it once the database is up to date.')
    return 0
  }

  let manifest
  try {
    manifest = JSON.parse(readFileSync(new URL('../supabase-required-schema.json', import.meta.url), 'utf8'))
  } catch {
    return report({ type: 'indeterminate', reason: 'could not read supabase-required-schema.json' })
  }
  if (mode.selftest) manifest = withSelfTest(manifest)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return report({ type: 'indeterminate', reason: 'Supabase credentials are not available in this environment' })
  }

  const client = clientFor(url, key)
  let result = await client.rpc(RPC)
  let kind = classifyRpcError(result.error)

  // Right after the helper is created, PostgREST can take a moment to notice it.
  if (kind.type === 'missing-helper') {
    await sleep(2000)
    result = await client.rpc(RPC)
    kind = classifyRpcError(result.error)
  }
  if (kind.type === 'missing-helper') return report({ type: 'missing-helper' })
  if (kind.type === 'indeterminate') return report(kind)
  if (!isUsableSnapshot(result.data)) {
    return report({ type: 'indeterminate', reason: 'the helper returned an unexpected answer' })
  }

  const code = report({ type: 'checked', evaluation: evaluateManifest(manifest, result.data) })
  if (mode.strict) await checkLockdown(url)
  return code
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    process.exitCode = report({ type: 'indeterminate', reason: `unexpected error: ${String(err?.message ?? err).slice(0, 140)}` })
  })
