-- ============================================================
-- Schema check helper
--
-- Creates public.list_schema_objects(): a READ-ONLY report of which tables,
-- columns, constraints, security policies, triggers, functions and storage
-- buckets exist in this database. It changes nothing and returns no row data.
--
-- scripts/check-schema.mjs calls it (with the server key) during the Vercel
-- production build and compares the answer with supabase-required-schema.json.
-- If the code being deployed needs SQL that has not been run yet, the deploy
-- is stopped and the last working version stays live, instead of shipping a
-- broken page. `npm run check:schema` runs the same check by hand.
--
-- Run this entire file in the Supabase SQL Editor. Safe to run more than once.
-- Only the service_role (server) key can call the function; the public
-- (anon) and signed-in (authenticated) roles cannot.
-- ============================================================

create or replace function public.list_schema_objects()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'helper_version', 1,

    'tables', coalesce((
      select jsonb_agg(c.relname::text order by c.relname::text)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
    ), '[]'::jsonb),

    'rls_enabled_tables', coalesce((
      select jsonb_agg(c.relname::text order by c.relname::text)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
    ), '[]'::jsonb),

    -- { "table.column": "data type" }
    'columns', coalesce((
      select jsonb_object_agg(
        c.relname::text || '.' || a.attname::text,
        pg_catalog.format_type(a.atttypid, a.atttypmod)
      )
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = c.oid
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and a.attnum > 0 and not a.attisdropped
    ), '{}'::jsonb),

    'constraints', coalesce((
      select jsonb_agg(jsonb_build_object(
        'table', c.relname::text,
        'name', k.conname::text,
        'definition', pg_catalog.pg_get_constraintdef(k.oid)
      ))
      from pg_catalog.pg_constraint k
      join pg_catalog.pg_class c on c.oid = k.conrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
    ), '[]'::jsonb),

    'policies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'schema', p.schemaname::text,
        'table', p.tablename::text,
        'name', p.policyname::text,
        'command', p.cmd::text,
        'roles', to_jsonb(p.roles),
        'using', p.qual,
        'with_check', p.with_check
      ))
      from pg_catalog.pg_policies p
      where p.schemaname in ('public', 'storage')
    ), '[]'::jsonb),

    'triggers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'schema', n.nspname::text,
        'table', c.relname::text,
        'name', t.tgname::text
      ))
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal
        and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users'))
    ), '[]'::jsonb),

    'functions', coalesce((
      select jsonb_agg(distinct p.proname::text)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
    ), '[]'::jsonb),

    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id::text,
        'public', b.public,
        'file_size_limit', b.file_size_limit,
        'allowed_mime_types', to_jsonb(b.allowed_mime_types)
      ))
      from storage.buckets b
    ), '[]'::jsonb),

    -- Columns the signed-in role may UPDATE (table-level or column-level grant).
    'authenticated_update_columns', coalesce((
      select jsonb_agg(c.relname::text || '.' || a.attname::text order by c.relname::text, a.attnum)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = c.oid
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and a.attnum > 0 and not a.attisdropped
        and pg_catalog.has_column_privilege('authenticated'::name, c.oid, a.attnum, 'UPDATE')
    ), '[]'::jsonb)
  );
$$;

-- Supabase's default privileges grant EXECUTE on new public functions to anon and
-- authenticated, so those are revoked explicitly. Only the server key may call this.
revoke all on function public.list_schema_objects() from public;
revoke all on function public.list_schema_objects() from anon, authenticated;
grant execute on function public.list_schema_objects() to service_role;

notify pgrst, 'reload schema';
