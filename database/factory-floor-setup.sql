-- Factory Floor: one-time Supabase setup. Paste this whole file into
-- Supabase > SQL Editor > New query, then click Run. Safe to run twice.

create table if not exists public.ff_kv (
  path       text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.ff_kv enable row level security;
drop policy if exists "ff_kv open" on public.ff_kv;
create policy "ff_kv open" on public.ff_kv
  for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.ff_kv to anon, authenticated;

-- server clock, so every device shows the same countdown
create or replace function public.ff_now() returns bigint
  language sql stable as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;
grant execute on function public.ff_now() to anon, authenticated;

-- live updates
do $$ begin
  alter publication supabase_realtime add table public.ff_kv;
exception when duplicate_object then null; end $$;
