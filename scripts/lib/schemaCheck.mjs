// ============================================================
// Pure logic for scripts/check-schema.mjs.
//
// No network, no filesystem, no process access in here -- everything takes
// plain data and returns plain data, so each rule can be unit tested
// (schemaCheck.test.mjs). The script itself does the I/O.
// ============================================================

export const REQUIREMENT_KINDS = [
  'tables',
  'rls',
  'columns',
  'constraints',
  'policies',
  'absentPolicies',
  'functions',
  'triggers',
  'buckets',
  'updateGrants',
]

export const SELFTEST_TABLE = 'zz_schema_check_selftest_table'

const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const asArray = (v) => (Array.isArray(v) ? v : [])
const sameSet = (a, b) => {
  const x = new Set(a)
  const y = new Set(b)
  return x.size === y.size && [...x].every((v) => y.has(v))
}

// ── Checking one requirement against a snapshot of the live database ─────────

/** @returns {{ ok: boolean, text: string }} text is a plain-English description of the requirement. */
export function checkRequirement(kind, req, snap) {
  switch (kind) {
    case 'tables':
      return { ok: asArray(snap.tables).includes(req), text: `table ${req}` }

    case 'rls':
      return { ok: asArray(snap.rls_enabled_tables).includes(req), text: `row-level security switched on for table ${req}` }

    case 'columns': {
      const [name, type] = String(req).split(':')
      const actual = snap.columns && typeof snap.columns === 'object' ? snap.columns[name] : undefined
      const typeOk = !type || squash(actual) === squash(type)
      return { ok: actual !== undefined && typeOk, text: `column ${name}${type ? ` (${type})` : ''}` }
    }

    case 'constraints': {
      const needles = asArray(req.includes).map(squash)
      const found = asArray(snap.constraints).some(
        (c) =>
          c.table === req.table &&
          (!req.name || c.name === req.name) &&
          needles.every((n) => squash(c.definition).includes(n))
      )
      const label = req.name ?? asArray(req.includes).join(' + ')
      return { ok: found, text: `database rule ${label} on table ${req.table}` }
    }

    case 'policies': {
      const p = asArray(snap.policies).find((x) => x.schema === req.schema && x.table === req.table && x.name === req.name)
      let ok = !!p
      if (p && req.command && String(p.command).toUpperCase() !== req.command.toUpperCase()) ok = false
      if (p && req.withCheck && !squash(p.with_check)) ok = false
      const extras = [req.command, req.withCheck ? 'with a WITH CHECK' : null].filter(Boolean).join(', ')
      return { ok, text: `security policy "${req.name}" on ${req.schema}.${req.table}${extras ? ` (${extras})` : ''}` }
    }

    case 'absentPolicies': {
      const present = asArray(snap.policies).some((x) => x.schema === req.schema && x.table === req.table && x.name === req.name)
      return { ok: !present, text: `old security policy "${req.name}" on ${req.schema}.${req.table} should have been removed` }
    }

    case 'functions':
      return { ok: asArray(snap.functions).includes(req), text: `function ${req}` }

    case 'triggers': {
      const found = asArray(snap.triggers).some((t) => t.schema === req.schema && t.table === req.table && t.name === req.name)
      return { ok: found, text: `trigger ${req.name} on ${req.schema}.${req.table}` }
    }

    case 'buckets': {
      const b = asArray(snap.buckets).find((x) => x.id === req.id)
      let ok = !!b
      if (b && 'public' in req && b.public !== req.public) ok = false
      if (b && 'fileSizeLimit' in req && Number(b.file_size_limit) !== req.fileSizeLimit) ok = false
      if (b && 'allowedMimeTypes' in req && !sameSet(asArray(b.allowed_mime_types), req.allowedMimeTypes)) ok = false
      const bits = []
      if ('public' in req) bits.push(req.public ? 'public' : 'private')
      if ('fileSizeLimit' in req) bits.push(`${Math.round(req.fileSizeLimit / 1048576)} MB limit`)
      if ('allowedMimeTypes' in req) bits.push(req.allowedMimeTypes.join(', '))
      return { ok, text: `storage bucket ${req.id}${bits.length ? ` (${bits.join(', ')})` : ''}` }
    }

    case 'updateGrants': {
      const prefix = `${req.table}.`
      const actual = asArray(snap.authenticated_update_columns)
        .filter((c) => c.startsWith(prefix))
        .map((c) => c.slice(prefix.length))
      return {
        ok: sameSet(actual, req.exactColumns),
        text: `signed-in users may update only ${req.exactColumns.join(', ')} on table ${req.table}`,
      }
    }

    default:
      return { ok: false, text: `unknown requirement kind "${kind}"` }
  }
}

// ── Evaluating the whole manifest ────────────────────────────────────────────

export function isUsableSnapshot(snap) {
  return !!snap && typeof snap === 'object' && Array.isArray(snap.tables) && Array.isArray(snap.policies)
}

export function evaluateEntry(entry, snap) {
  const missing = []
  const advisoryMissing = []
  let total = 0

  for (const kind of REQUIREMENT_KINDS) {
    for (const req of asArray(entry.requires?.[kind])) {
      total++
      const r = checkRequirement(kind, req, snap)
      if (!r.ok) missing.push(r.text)
    }
    for (const req of asArray(entry.advisory?.[kind])) {
      const r = checkRequirement(kind, req, snap)
      if (!r.ok) advisoryMissing.push(r.text)
    }
  }

  return { id: entry.id, file: entry.file, rerunSafe: entry.rerunSafe !== false, note: entry.note ?? '', total, missing, advisoryMissing }
}

export function evaluateManifest(manifest, snap) {
  const entries = asArray(manifest.migrations).map((e) => evaluateEntry(e, snap))

  // The helper itself must be new enough for the checks that rely on it.
  if (typeof manifest.helperVersion === 'number' && Number(snap.helper_version ?? 0) < manifest.helperVersion) {
    const target = entries.find((e) => e.id === 'schema-check')
    if (target) {
      target.total++
      target.missing.push(`check helper version ${manifest.helperVersion} or newer (found ${snap.helper_version ?? 'none'})`)
    }
  }

  return {
    entries,
    totalChecked: entries.reduce((n, e) => n + e.total, 0),
    missingCount: entries.reduce((n, e) => n + e.missing.length, 0),
    advisoryCount: entries.reduce((n, e) => n + e.advisoryMissing.length, 0),
  }
}

/** Adds a fake always-missing requirement, so the whole gate can be proven end to end. */
export function withSelfTest(manifest) {
  return {
    ...manifest,
    migrations: [
      ...asArray(manifest.migrations),
      { id: 'selftest', file: '(self-test: this requirement is deliberately fake)', rerunSafe: true, requires: { tables: [SELFTEST_TABLE] } },
    ],
  }
}

// ── Mode and outcome ─────────────────────────────────────────────────────────

export function shouldEnforce({ env = {}, argv = [] }) {
  const skip = env.SKIP_SCHEMA_CHECK === '1' || env.SKIP_SCHEMA_CHECK === 'true'
  const strict = argv.includes('--strict')
  const production = env.VERCEL_ENV === 'production'
  const enforce = strict || production
  const label = production
    ? 'ENFORCE (VERCEL_ENV=production)'
    : strict
      ? 'ENFORCE (--strict)'
      : `WARN-ONLY (VERCEL_ENV=${env.VERCEL_ENV ?? 'not set'})`
  return { skip, strict, production, enforce, selftest: env.SCHEMA_CHECK_SELFTEST === '1', label }
}

function describeError(error) {
  const bits = [error?.code, error?.status ? `HTTP ${error.status}` : null, String(error?.message ?? '').slice(0, 140)]
  return bits.filter(Boolean).join(' ') || 'unknown error'
}

/** Sorts an error from calling the helper into "helper not installed" vs "could not verify". */
export function classifyRpcError(error) {
  if (!error) return { type: 'ok' }
  const message = String(error.message ?? '')
  if (error.code === 'PGRST202' || /could not find the function/i.test(message)) return { type: 'missing-helper' }
  return { type: 'indeterminate', reason: describeError(error) }
}

/**
 * outcome: { type: 'checked', evaluation } | { type: 'missing-helper' } | { type: 'indeterminate', reason }
 *
 * A definite gap fails only when enforcing. Not being able to check at all
 * (no credentials, network trouble, Supabase down) must never take a deploy
 * down, so it only fails a manual --strict run -- which is also never
 * allowed to print PASSED.
 */
export function decide({ outcome, mode }) {
  if (outcome.type === 'indeterminate') {
    return {
      verdict: 'NOT VERIFIED',
      exitCode: mode.strict ? 2 : 0,
      summary: `SCHEMA CHECK: NOT VERIFIED (${outcome.reason}) -- mode=${mode.label}`,
    }
  }

  if (outcome.type === 'missing-helper') {
    return {
      verdict: 'FAILED',
      exitCode: mode.enforce ? 1 : 0,
      summary: `SCHEMA CHECK: FAILED -- the database check helper is not installed yet -- mode=${mode.label}`,
    }
  }

  const { missingCount, totalChecked } = outcome.evaluation
  if (missingCount === 0) {
    return {
      verdict: 'PASSED',
      exitCode: 0,
      summary: `SCHEMA CHECK: PASSED (${totalChecked} requirements verified) -- mode=${mode.label}`,
    }
  }
  return {
    verdict: 'FAILED',
    exitCode: mode.enforce ? 1 : 0,
    summary: `SCHEMA CHECK: FAILED -- ${missingCount} of ${totalChecked} requirements are missing from the live database -- mode=${mode.label}`,
  }
}

// ── The report a person reads ────────────────────────────────────────────────

function rerunAdvice(entry) {
  if (entry.rerunSafe) return 'safe to run again'
  if (entry.missing.length >= entry.total) return 'not applied yet -- run it once'
  return 'PARTLY applied -- do NOT re-run the whole file; ask Claude for a patch'
}

export function formatReport({ outcome, decision, mode }) {
  const lines = [decision.summary]

  if (outcome.type === 'missing-helper') {
    lines.push(
      '',
      'The check needs a small read-only helper in the database.',
      'Run supabase-migration-schema-check.sql in the Supabase SQL Editor (safe to run more than once).'
    )
  }

  if (outcome.type === 'checked') {
    const failing = outcome.evaluation.entries.filter((e) => e.missing.length > 0)
    for (const e of failing) {
      lines.push('', `  ${e.file}  --  ${rerunAdvice(e)}`)
      if (e.note) lines.push(`    note: ${e.note}`)
      for (const m of e.missing) lines.push(`    - ${m}`)
    }
    const warn = outcome.evaluation.entries.filter((e) => e.advisoryMissing.length > 0)
    if (warn.length > 0) {
      lines.push('', 'Heads-up (reported only, does not block a deploy):')
      for (const e of warn) for (const m of e.advisoryMissing) lines.push(`  - ${e.file}: ${m}`)
    }
  }

  if (decision.verdict === 'FAILED') {
    if (mode.strict && !mode.production) {
      lines.push(
        '',
        'The database is not up to date with this code.',
        'What to do: open the Supabase SQL Editor, paste in and run the file(s) named above (or ask Claude for a patch where it says so), then run `npm run check:schema` again.'
      )
    } else if (mode.enforce) {
      lines.push(
        '',
        'This deploy was stopped on purpose: the code needs database changes that have not been applied, and the last working version stays live.',
        'What to do:',
        '  1. Open the Supabase SQL Editor, paste in and run the file(s) named above (or ask Claude for a patch where it says so).',
        '  2. In Vercel: Deployments -> the failed one -> the ... menu -> Redeploy. No new push is needed.',
        'Emergency bypass (not recommended): add SKIP_SCHEMA_CHECK=1 under Vercel > Settings > Environment Variables (Production), redeploy, then remove it again.'
      )
    } else {
      lines.push('', 'Warning only -- this is not a production deploy, so the build continues.')
    }
  }

  if (decision.verdict === 'NOT VERIFIED' && !mode.strict) {
    lines.push('', 'The schema could not be verified, so the build continues. Run `npm run check:schema` to check by hand.')
  }

  return lines.join('\n')
}

// ── Reading SQL files (used by the manifest tests) ───────────────────────────

export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
}

/** The named objects a SQL file creates, so a test can make sure the manifest accounts for every one. */
export function extractSqlObjects(sqlText) {
  const sql = stripSqlComments(sqlText)
  const out = []
  const grab = (kind, re) => {
    for (const m of sql.matchAll(re)) out.push({ kind, name: m[1] })
  }
  grab('table', /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:\w+\.)?"?(\w+)"?/gi)
  grab('column', /add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi)
  grab('policy', /create\s+policy\s+"([^"]+)"/gi)
  grab('constraint', /add\s+constraint\s+"?(\w+)"?/gi)
  grab('function', /create\s+(?:or\s+replace\s+)?function\s+(?:\w+\.)?(\w+)/gi)
  grab('trigger', /create\s+(?:or\s+replace\s+)?trigger\s+(\w+)/gi)
  if (/storage\.buckets/i.test(sql)) {
    const m = sql.match(/values\s*\(\s*'([^']+)'/i)
    if (m) out.push({ kind: 'bucket', name: m[1] })
  }
  return out
}
