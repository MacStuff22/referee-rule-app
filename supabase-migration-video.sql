-- ============================================================
-- Video questions
--
-- Any standard or compound question can carry an optional game clip. The clip
-- plays (video_plays times, back to back) before the question is revealed.
--
--   * questions.video_path   -- object path inside the private `question-videos`
--                               bucket ('' = no video). Users never get a
--                               direct storage URL: the server hands out
--                               short-lived signed URLs (src/app/api/video).
--   * questions.video_plays  -- how many times the clip auto-plays (1-5, default 2)
--   * question_admin_notes   -- private admin-only notes (game / date / source)
--                               kept out of `questions` so no client-side
--                               `select *` can ever leak them to quiz takers.
--
-- Run this in the Supabase SQL Editor BEFORE deploying the matching code --
-- the quiz results page selects video_path and would error without it.
-- ============================================================

alter table public.questions
  add column if not exists video_path text not null default '',
  add column if not exists video_plays int not null default 2;

alter table public.questions
  drop constraint if exists questions_video_plays_check;
alter table public.questions
  add constraint questions_video_plays_check check (video_plays between 1 and 5);

-- ── Admin-only source notes ──────────────────────────────────────────────────

create table if not exists public.question_admin_notes (
  question_id uuid primary key references public.questions(id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz default now()
);

alter table public.question_admin_notes enable row level security;

drop policy if exists "Admins can manage question notes" on public.question_admin_notes;
create policy "Admins can manage question notes"
  on public.question_admin_notes for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ── Private storage bucket ───────────────────────────────────────────────────
-- Not public: no one can fetch a file without a signed URL. 50 MB cap per file
-- (the Supabase free-plan maximum); mp4 only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-videos', 'question-videos', false, 52428800, array['video/mp4'])
on conflict (id) do update
  set public = false,
      file_size_limit = 52428800,
      allowed_mime_types = array['video/mp4'];

-- Only admins can add / replace / remove clips from the browser. There is
-- deliberately NO select policy for regular users -- they only ever reach a
-- clip through a signed URL created server-side with the service role.

drop policy if exists "Admins can upload question videos" on storage.objects;
create policy "Admins can upload question videos"
  on storage.objects for insert
  with check (
    bucket_id = 'question-videos'
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "Admins can update question videos" on storage.objects;
create policy "Admins can update question videos"
  on storage.objects for update
  using (
    bucket_id = 'question-videos'
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "Admins can delete question videos" on storage.objects;
create policy "Admins can delete question videos"
  on storage.objects for delete
  using (
    bucket_id = 'question-videos'
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
