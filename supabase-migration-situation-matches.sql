-- Pairwise relationships between situations that duplicate or closely relate
-- to each other (e.g. situation 16D and 24L ask the same question). Stored as
-- pairs, not groups, because match type can vary within a connected set of
-- situations (72A and 76R are an exact match to each other, but each is only
-- "very similar" to 80A).

create table public.situation_matches (
  id uuid default gen_random_uuid() primary key,
  situation_id_a text not null,
  situation_id_b text not null,
  match_type text not null check (match_type in ('exact_match', 'very_similar', 'similar_concept')),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  constraint situation_matches_not_self check (situation_id_a <> situation_id_b),
  unique (situation_id_a, situation_id_b)
);

alter table public.situation_matches enable row level security;

-- Quiz generation runs as the logged-in end user (not a service-role client),
-- so it needs read access to compute suppression — the table holds no
-- sensitive data, just which situations relate to each other.
create policy "Authenticated users can view situation matches"
  on public.situation_matches for select
  using (auth.uid() is not null);

create policy "Admins can manage situation matches"
  on public.situation_matches for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
