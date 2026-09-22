create table public.career_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 3500000),
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
alter table public.career_workspaces enable row level security;
revoke all on public.career_workspaces from anon;
grant select, insert, update, delete on public.career_workspaces to authenticated;
create policy "Users own their career workspace" on public.career_workspaces
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
