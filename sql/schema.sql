-- Enable required extensions
create extension if not exists pgcrypto;

-- USERS
create table if not exists public.users (
  id uuid primary key default auth.uid(),
  email text unique,
  created_at timestamptz default now()
);

-- LISTINGS
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text,
  tags text,                      -- comma-separated
  description text,               -- bb-code output
  faqs text,                      -- optional (JSON or text; using text for simplicity)
  vision_summary text,            -- from READ
  image_url text,                 -- original upload (signed or public URL)
  status text default 'draft' check (status in ('draft','active','archived')),
  chat_history jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table public.users enable row level security;
alter table public.listings enable row level security;

create policy "users read own user"
  on public.users for select
  using (id = auth.uid());

create policy "listings owner full"
  on public.listings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Updated-at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;$$;

drop trigger if exists trg_set_updated_at on public.listings;
create trigger trg_set_updated_at
before update on public.listings
for each row execute function public.set_updated_at();

-- Storage bucket (private)
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('listing-images', 'listing-images', false);
exception
  when unique_violation then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'allow user folder ops'
  ) then
    create policy "allow user folder ops"
      on storage.objects for all to authenticated
      using (
        bucket_id = 'listing-images'
        and (storage.foldername(name))[1] = auth.uid()::text -- userId/.../file
      )
      with check (
        bucket_id = 'listing-images'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
