-- ============================================================
-- Admin audit log (Finding 10)
--
-- Backs the new in-app role/deactivate controls on /admin/users. Every
-- change writes a row here via the service-role API routes
-- (src/app/api/admin/users/[id]/role and .../status) -- there is no
-- insert/update/delete policy for anyone, matching the user_category_mastery
-- pattern from Finding 6: RLS denies by default with no policy present, so
-- only a service-role client (which bypasses RLS) can write.
-- ============================================================

create table public.admin_audit_log (
  id uuid default gen_random_uuid() primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('role_change', 'status_change')),
  details jsonb not null default '{}',
  created_at timestamptz default now()
);

alter table public.admin_audit_log enable row level security;

create policy "Admins can view audit log"
  on public.admin_audit_log for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
