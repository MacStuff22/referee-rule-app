-- ============================================================
-- profiles.email integrity
--
-- profiles.email had no unique constraint, and handle_new_user() only
-- fires `after insert` on auth.users -- so if an official's email is ever
-- changed (by them, or directly in the Supabase dashboard's Authentication
-- -> Users panel), profiles.email silently goes stale while auth.users.email
-- (the real source of truth) moves on. There's no in-app "change email"
-- feature, but that doesn't matter: the dashboard and the Admin API can
-- both change auth.users.email directly, bypassing the app entirely.
--
-- The unique constraint should apply cleanly with no pre-existing
-- duplicates: auth.users.email already has its own unique constraint at
-- the Supabase Auth layer, and profiles.email only ever gets its value
-- copied from there.
--
-- The sync trigger mirrors handle_new_user()'s existing shape (security
-- definer, same style) rather than switching every read site in the app
-- to query auth.users directly -- smaller footprint, no src/ changes.
-- ============================================================

alter table public.profiles
  add constraint profiles_email_unique unique (email);

create or replace function public.handle_user_email_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute procedure public.handle_user_email_update();
