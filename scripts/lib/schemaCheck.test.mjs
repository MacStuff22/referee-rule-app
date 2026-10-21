import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  REQUIREMENT_KINDS,
  SELFTEST_TABLE,
  checkRequirement,
  classifyRpcError,
  decide,
  evaluateManifest,
  extractSqlObjects,
  formatReport,
  isUsableSnapshot,
  shouldEnforce,
  stripSqlComments,
  withSelfTest,
} from './schemaCheck.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const manifest = JSON.parse(readFileSync(`${root}supabase-required-schema.json`, 'utf8'))

/** Builds the database snapshot that exactly satisfies a manifest (used to prove the manifest is self-consistent). */
function snapshotFromManifest(m) {
  const snap = {
    helper_version: m.helperVersion ?? 1,
    tables: [], rls_enabled_tables: [], columns: {}, constraints: [], policies: [],
    triggers: [], functions: [], buckets: [], authenticated_update_columns: [],
  }
  let n = 0
  for (const e of m.migrations) {
    for (const group of [e.requires ?? {}, e.advisory ?? {}]) {
      snap.tables.push(...(group.tables ?? []))
      snap.rls_enabled_tables.push(...(group.rls ?? []))
      for (const c of group.columns ?? []) {
        const [name, type] = c.split(':')
        snap.columns[name] = type ?? 'text'
      }
      for (const c of group.constraints ?? []) {
        snap.constraints.push({ table: c.table, name: c.name ?? `auto_${n++}`, definition: (c.includes ?? []).join(' ') })
      }
      for (const p of group.policies ?? []) {
        snap.policies.push({ schema: p.schema, table: p.table, name: p.name, command: p.command ?? 'ALL', with_check: p.withCheck ? 'true' : null })
      }
      snap.functions.push(...(group.functions ?? []))
      snap.triggers.push(...(group.triggers ?? []))
      for (const b of group.buckets ?? []) {
        snap.buckets.push({ id: b.id, public: b.public, file_size_limit: b.fileSizeLimit, allowed_mime_types: b.allowedMimeTypes })
      }
      for (const g of group.updateGrants ?? []) snap.authenticated_update_columns.push(...g.exactColumns.map((c) => `${g.table}.${c}`))
    }
  }
  return snap
}

// ── The contract itself ──────────────────────────────────────────────────────

describe('supabase-required-schema.json', () => {
  const migrationFiles = readdirSync(root).filter((f) => /^supabase-migration-.*\.sql$/.test(f))

  it('has an entry for every supabase-migration-*.sql file, so a new migration cannot be forgotten', () => {
    const listed = new Set(manifest.migrations.map((e) => e.file))
    for (const f of migrationFiles) expect(listed, `${f} is missing from supabase-required-schema.json`).toContain(f)
  })

  it('has unique ids and files, and every file exists', () => {
    const ids = manifest.migrations.map((e) => e.id)
    const files = manifest.migrations.map((e) => e.file)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(files).size).toBe(files.length)
    for (const f of files) expect(existsSync(`${root}${f}`), `${f} does not exist`).toBe(true)
  })

  it('never has a hollow entry: each one checks something or explains why not', () => {
    for (const e of manifest.migrations) {
      const checks = REQUIREMENT_KINDS.reduce((n, k) => n + (e.requires?.[k]?.length ?? 0) + (e.advisory?.[k]?.length ?? 0), 0)
      expect(checks > 0 || typeof e.noChecks === 'string', `${e.id} checks nothing`).toBe(true)
    }
  })

  it('accounts for every table, column, policy, constraint, function, trigger and bucket each SQL file creates', () => {
    for (const e of manifest.migrations) {
      const entryText = JSON.stringify(e)
      const objects = extractSqlObjects(readFileSync(`${root}${e.file}`, 'utf8'))
      for (const o of objects) {
        expect(entryText.includes(o.name), `${e.file}: ${o.kind} "${o.name}" is not in its manifest entry (add it to requires, or to intentionallyUnchecked with a reason)`).toBe(true)
      }
    }
  })

  it('is satisfied by a database that has everything it describes', () => {
    const result = evaluateManifest(manifest, snapshotFromManifest(manifest))
    expect(result.entries.flatMap((e) => e.missing)).toEqual([])
    expect(result.advisoryCount).toBe(0)
    expect(result.totalChecked).toBeGreaterThan(50)
  })

  it('notices when the video schema is missing, and says which file fixes it', () => {
    const snap = snapshotFromManifest(manifest)
    delete snap.columns['questions.video_path']
    snap.tables = snap.tables.filter((t) => t !== 'question_admin_notes')
    snap.buckets = []
    const result = evaluateManifest(manifest, snap)
    const video = result.entries.find((e) => e.id === 'video')
    expect(video.missing.join('|')).toContain('questions.video_path')
    expect(video.missing.join('|')).toContain('question_admin_notes')
    expect(video.missing.join('|')).toContain('question-videos')
    expect(result.entries.filter((e) => e.missing.length > 0).map((e) => e.id)).toEqual(['video'])
  })

  it('catches a same-named constraint that was never re-applied (the league incident)', () => {
    const snap = snapshotFromManifest(manifest)
    // The old inline constraint has the right NAME but the old, single-value definition.
    snap.constraints = snap.constraints.map((c) =>
      c.name === 'questions_league_check' ? { ...c, definition: "CHECK ((league = ANY (ARRAY['NHL'::text, 'AHL'::text, 'both'::text])))" } : c
    )
    const result = evaluateManifest(manifest, snap)
    expect(result.entries.find((e) => e.id === 'league-multiselect').missing.join('|')).toContain('questions_league_check')
  })

  it('catches the old permissive answers policy being reinstated', () => {
    const snap = snapshotFromManifest(manifest)
    snap.policies.push({ schema: 'public', table: 'quiz_answers', name: 'Users can manage own answers', command: 'ALL', with_check: null })
    const result = evaluateManifest(manifest, snap)
    expect(result.entries.find((e) => e.id === 'answer-integrity').missing.join('|')).toContain('Users can manage own answers')
  })
})

// ── Each kind of requirement ─────────────────────────────────────────────────

describe('checkRequirement', () => {
  const snap = {
    tables: ['a'], rls_enabled_tables: ['a'],
    columns: { 'a.x': 'text[]', 'a.n': 'integer' },
    constraints: [{ table: 'a', name: 'a_check', definition: "CHECK ((league <@ ARRAY['NHL'::text]) AND (cardinality(league) > 0))" }],
    policies: [{ schema: 'public', table: 'a', name: 'P', command: 'INSERT', with_check: '(auth.uid() = id)' }],
    triggers: [{ schema: 'auth', table: 'users', name: 't' }],
    functions: ['f'],
    buckets: [{ id: 'b', public: false, file_size_limit: 100, allowed_mime_types: ['video/mp4'] }],
    authenticated_update_columns: ['a.x', 'a.y'],
  }
  const ok = (kind, req) => checkRequirement(kind, req, snap).ok

  it('tables, rls, functions', () => {
    expect(ok('tables', 'a')).toBe(true)
    expect(ok('tables', 'z')).toBe(false)
    expect(ok('rls', 'a')).toBe(true)
    expect(ok('rls', 'z')).toBe(false)
    expect(ok('functions', 'f')).toBe(true)
    expect(ok('functions', 'g')).toBe(false)
  })

  it('columns, including the type', () => {
    expect(ok('columns', 'a.x')).toBe(true)
    expect(ok('columns', 'a.x:text[]')).toBe(true)
    expect(ok('columns', 'a.x:text')).toBe(false)
    expect(ok('columns', 'a.missing')).toBe(false)
  })

  it('constraints match by table plus definition, not just by name', () => {
    expect(ok('constraints', { table: 'a', name: 'a_check', includes: ['cardinality(league)'] })).toBe(true)
    expect(ok('constraints', { table: 'a', name: 'a_check', includes: ["'scoreboard'"] })).toBe(false)
    expect(ok('constraints', { table: 'a', includes: ['CARDINALITY(LEAGUE)'] })).toBe(true)
    expect(ok('constraints', { table: 'other', name: 'a_check' })).toBe(false)
  })

  it('policies, including command and WITH CHECK', () => {
    expect(ok('policies', { schema: 'public', table: 'a', name: 'P', command: 'INSERT', withCheck: true })).toBe(true)
    expect(ok('policies', { schema: 'public', table: 'a', name: 'P', command: 'SELECT' })).toBe(false)
    expect(ok('policies', { schema: 'public', table: 'a', name: 'Nope' })).toBe(false)
    const noCheck = { ...snap, policies: [{ ...snap.policies[0], with_check: null }] }
    expect(checkRequirement('policies', { schema: 'public', table: 'a', name: 'P', withCheck: true }, noCheck).ok).toBe(false)
  })

  it('absent policies', () => {
    expect(ok('absentPolicies', { schema: 'public', table: 'a', name: 'Gone' })).toBe(true)
    expect(ok('absentPolicies', { schema: 'public', table: 'a', name: 'P' })).toBe(false)
  })

  it('triggers', () => {
    expect(ok('triggers', { schema: 'auth', table: 'users', name: 't' })).toBe(true)
    expect(ok('triggers', { schema: 'public', table: 'users', name: 't' })).toBe(false)
  })

  it('buckets, including privacy, size and file types', () => {
    expect(ok('buckets', { id: 'b', public: false, fileSizeLimit: 100, allowedMimeTypes: ['video/mp4'] })).toBe(true)
    expect(ok('buckets', { id: 'b', public: true })).toBe(false)
    expect(ok('buckets', { id: 'b', fileSizeLimit: 5 })).toBe(false)
    expect(ok('buckets', { id: 'b', allowedMimeTypes: ['video/mp4', 'image/png'] })).toBe(false)
    expect(ok('buckets', { id: 'missing' })).toBe(false)
  })

  it('update grants must match exactly', () => {
    expect(ok('updateGrants', { table: 'a', exactColumns: ['y', 'x'] })).toBe(true)
    expect(ok('updateGrants', { table: 'a', exactColumns: ['x'] })).toBe(false)
  })

  it('an unknown kind fails rather than silently passing', () => {
    expect(ok('nonsense', 'x')).toBe(false)
  })
})

// ── Mode and outcomes ────────────────────────────────────────────────────────

describe('shouldEnforce', () => {
  it('enforces on a Vercel production build or with --strict, and only warns elsewhere', () => {
    expect(shouldEnforce({ env: { VERCEL_ENV: 'production' }, argv: [] }).enforce).toBe(true)
    expect(shouldEnforce({ env: {}, argv: ['--strict'] }).enforce).toBe(true)
    expect(shouldEnforce({ env: { VERCEL_ENV: 'preview' }, argv: [] }).enforce).toBe(false)
    expect(shouldEnforce({ env: {}, argv: [] }).enforce).toBe(false)
  })

  it('reads the bypass and self-test switches', () => {
    expect(shouldEnforce({ env: { SKIP_SCHEMA_CHECK: '1' } }).skip).toBe(true)
    expect(shouldEnforce({ env: {} }).skip).toBe(false)
    expect(shouldEnforce({ env: { SCHEMA_CHECK_SELFTEST: '1' } }).selftest).toBe(true)
  })

  it('labels the mode so a build log shows what happened', () => {
    expect(shouldEnforce({ env: { VERCEL_ENV: 'production' } }).label).toBe('ENFORCE (VERCEL_ENV=production)')
    expect(shouldEnforce({ env: {} }).label).toContain('WARN-ONLY')
  })
})

describe('classifyRpcError', () => {
  it('tells "helper not installed" apart from "could not check"', () => {
    expect(classifyRpcError(null).type).toBe('ok')
    expect(classifyRpcError({ code: 'PGRST202', message: 'x' }).type).toBe('missing-helper')
    expect(classifyRpcError({ message: 'Could not find the function public.list_schema_objects without parameters' }).type).toBe('missing-helper')
    expect(classifyRpcError({ code: '', message: 'TypeError: fetch failed' }).type).toBe('indeterminate')
    expect(classifyRpcError({ status: 503, message: 'Service Unavailable' }).type).toBe('indeterminate')
    expect(classifyRpcError({ status: 401, message: 'Invalid API key' }).type).toBe('indeterminate')
  })

  it('never puts request headers or keys into the reason it reports', () => {
    const reason = classifyRpcError({ code: '42501', message: 'permission denied', headers: { apikey: 'SECRET-KEY' }, details: 'SECRET-KEY' }).reason
    expect(reason).not.toContain('SECRET')
  })
})

describe('decide', () => {
  const enforce = shouldEnforce({ env: { VERCEL_ENV: 'production' } })
  const warn = shouldEnforce({ env: {} })
  const strict = shouldEnforce({ env: {}, argv: ['--strict'] })
  const missing = { type: 'checked', evaluation: { missingCount: 2, totalChecked: 10, entries: [] } }
  const clean = { type: 'checked', evaluation: { missingCount: 0, totalChecked: 10, entries: [] } }

  it('a definite gap fails a production build and a strict run, but only warns locally', () => {
    expect(decide({ outcome: missing, mode: enforce })).toMatchObject({ verdict: 'FAILED', exitCode: 1 })
    expect(decide({ outcome: missing, mode: strict })).toMatchObject({ verdict: 'FAILED', exitCode: 1 })
    expect(decide({ outcome: missing, mode: warn })).toMatchObject({ verdict: 'FAILED', exitCode: 0 })
  })

  it('a missing helper is a failure with the same enforcement rules', () => {
    expect(decide({ outcome: { type: 'missing-helper' }, mode: enforce }).exitCode).toBe(1)
    expect(decide({ outcome: { type: 'missing-helper' }, mode: warn }).exitCode).toBe(0)
  })

  it('failing to CHECK never fails a deploy, but a manual strict run exits 2 and never claims PASSED', () => {
    const outcome = { type: 'indeterminate', reason: 'fetch failed' }
    expect(decide({ outcome, mode: enforce })).toMatchObject({ verdict: 'NOT VERIFIED', exitCode: 0 })
    const s = decide({ outcome, mode: strict })
    expect(s).toMatchObject({ verdict: 'NOT VERIFIED', exitCode: 2 })
    expect(s.summary).not.toContain('PASSED')
  })

  it('passes only when nothing is missing', () => {
    expect(decide({ outcome: clean, mode: enforce })).toMatchObject({ verdict: 'PASSED', exitCode: 0 })
  })

  it('the self-test injects a requirement that always fails', () => {
    const snap = snapshotFromManifest(manifest)
    expect(snap.tables).not.toContain(SELFTEST_TABLE)
    const evaluation = evaluateManifest(withSelfTest(manifest), snap)
    expect(evaluation.missingCount).toBe(1)
    expect(decide({ outcome: { type: 'checked', evaluation }, mode: enforce }).exitCode).toBe(1)
  })

  it('a bad snapshot is recognised', () => {
    expect(isUsableSnapshot(null)).toBe(false)
    expect(isUsableSnapshot({})).toBe(false)
    expect(isUsableSnapshot(snapshotFromManifest(manifest))).toBe(true)
  })
})

// ── What a person reads ──────────────────────────────────────────────────────

describe('formatReport', () => {
  const enforce = shouldEnforce({ env: { VERCEL_ENV: 'production' } })
  const warn = shouldEnforce({ env: {} })

  function reportFor(entryOverrides, mode = enforce) {
    const entry = { id: 'x', file: 'supabase-migration-x.sql', rerunSafe: true, note: '', total: 4, missing: ['column a.b'], advisoryMissing: [], ...entryOverrides }
    const outcome = { type: 'checked', evaluation: { entries: [entry], missingCount: entry.missing.length, totalChecked: entry.total, advisoryCount: 0 } }
    return formatReport({ outcome, decision: decide({ outcome, mode }), mode })
  }

  it('names the file to run, what is missing, and how to redeploy', () => {
    const text = reportFor({})
    expect(text).toContain('supabase-migration-x.sql')
    expect(text).toContain('column a.b')
    expect(text).toContain('safe to run again')
    expect(text).toContain('Redeploy')
    expect(text).toContain('SKIP_SCHEMA_CHECK=1')
  })

  it('does not tell anyone to re-run a partly applied file that is not re-runnable', () => {
    const text = reportFor({ rerunSafe: false })
    expect(text).toContain('do NOT re-run')
    expect(text).not.toContain('safe to run again')
  })

  it('says a wholly unapplied non-re-runnable file should be run once', () => {
    expect(reportFor({ rerunSafe: false, total: 1, missing: ['table t'] })).toContain('run it once')
  })

  it('points at the helper file when the helper is not installed', () => {
    const outcome = { type: 'missing-helper' }
    const text = formatReport({ outcome, decision: decide({ outcome, mode: enforce }), mode: enforce })
    expect(text).toContain('supabase-migration-schema-check.sql')
  })

  it('a manual strict run does not pretend a deploy was stopped', () => {
    const strict = shouldEnforce({ env: {}, argv: ['--strict'] })
    const text = reportFor({}, strict)
    expect(text).not.toContain('This deploy was stopped')
    expect(text).toContain('npm run check:schema')
  })

  it('only claims the deploy was stopped when it actually was', () => {
    expect(reportFor({}, enforce)).toContain('stopped on purpose')
    const local = reportFor({}, warn)
    expect(local).toContain('Warning only')
    expect(local).not.toContain('stopped on purpose')
  })

  it('reports advisory gaps without failing', () => {
    const outcome = {
      type: 'checked',
      evaluation: { entries: [{ id: 'x', file: 'f.sql', rerunSafe: true, note: '', total: 1, missing: [], advisoryMissing: ['grants'] }], missingCount: 0, totalChecked: 1, advisoryCount: 1 },
    }
    const decision = decide({ outcome, mode: enforce })
    expect(decision.verdict).toBe('PASSED')
    expect(formatReport({ outcome, decision, mode: enforce })).toContain('does not block')
  })
})

// ── Reading SQL ──────────────────────────────────────────────────────────────

describe('extractSqlObjects', () => {
  const sql = `
    -- create table public.in_a_comment (id int);
    create table if not exists public.things (id int);
    alter table public.things add column if not exists color text;
    create policy "Only owners" on public.things for select using (true);
    alter table public.things add constraint things_color_check check (color <> '');
    create or replace function public.do_it() returns void language sql as $$ select 1 $$;
    create trigger on_thing after insert on public.things for each row execute function public.do_it();
    insert into storage.buckets (id, name) values ('clips', 'clips');
  `
  it('finds each kind of object and ignores comments', () => {
    const found = extractSqlObjects(sql).map((o) => `${o.kind}:${o.name}`)
    expect(found).toEqual(expect.arrayContaining([
      'table:things', 'column:color', 'policy:Only owners', 'constraint:things_color_check',
      'function:do_it', 'trigger:on_thing', 'bucket:clips',
    ]))
    expect(found.join('|')).not.toContain('in_a_comment')
  })

  it('strips both comment styles', () => {
    expect(stripSqlComments('a -- b\nc /* d */ e')).toBe('a \nc  e')
  })
})
