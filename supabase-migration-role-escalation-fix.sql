-- ============================================================
-- Role escalation fix
--
-- "Users can update own profile" used `for update using (auth.uid() = id)`
-- with no `with check`. Postgres reuses `using` as the implicit post-update
-- check in that case, so the policy never actually restricted which
-- columns could change -- including `role`. Any signed-in user could run
-- supabase.from('profiles').update({ role: 'admin' }).eq('id', ownId) from
-- the browser SDK and it would pass RLS, since `role in ('admin','user')`
-- doesn't stop 'admin' -- it's a legal value of the column. This is the
-- same bug class already fixed on quiz_answers in
-- supabase-migration-answer-integrity.sql; it was never applied here.
--
-- RLS policies apply per row, not per column, so there's no `with check`
-- expression that can compare against the row's *previous* role -- that
-- needs a trigger. This adds one: any change to `role` is rejected unless
-- the request is running as Supabase's service_role (i.e. came through a
-- service-role client, same as the existing admin-invite route already
-- uses). auth.role() reads the request's JWT claims and is NULL for a
-- session with no JWT context -- e.g. the Supabase Dashboard's SQL Editor
-- -- so this does not block the manual "make yourself admin" bootstrap
-- statement at the bottom of supabase-schema.sql; it only blocks
-- authenticated/anon requests coming through the app's normal client.
--
-- The update policy is also recreated with an explicit `with check`, so
-- the row-level intent is documented rather than relying on the implicit
-- using-as-with-check reuse that made this bug easy to miss in the first
-- place.
-- ============================================================

create or replace function public.prevent_role_change()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and auth.role() <> 'service_role' then
    raise exception 'permission denied: role can only be changed via an admin (service-role) action'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_role_change on public.profiles;

create trigger prevent_role_change
  before update on public.profiles
  for each row execute function public.prevent_role_change();

drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
