create table public.career_applications (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  details jsonb not null check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 300000),
  history jsonb not null check (jsonb_typeof(history) = 'array' and jsonb_array_length(history) between 1 and 1000 and octet_length(history::text) <= 150000),
  revision uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index career_applications_owner_created on public.career_applications (user_id, created_at, id);
alter table public.career_applications enable row level security;
revoke all on public.career_applications from anon;
grant select, insert, update, delete on public.career_applications to authenticated;
create policy "Users own their career applications" on public.career_applications
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
