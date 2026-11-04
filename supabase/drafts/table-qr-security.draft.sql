-- Mughal E Raj: draft-only migration for table QR credentials and short-lived sessions
-- IMPORTANT: This file has NOT been applied to Supabase.
-- Review and test in a non-production environment before applying to the live project.

begin;

create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  table_number text not null,
  qr_token_hash text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_tables_table_number_nonempty
    check (length(trim(table_number)) > 0),
  constraint restaurant_tables_qr_token_hash_nonempty
    check (length(trim(qr_token_hash)) > 0),
  constraint restaurant_tables_restaurant_table_unique
    unique (restaurant_id, table_number)
);

create table if not exists public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.restaurant_tables(id) on delete restrict,
  session_token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint table_sessions_token_hash_nonempty
    check (length(trim(session_token_hash)) > 0),
  constraint table_sessions_expiry_after_creation
    check (expires_at > created_at)
);

create index if not exists restaurant_tables_restaurant_active_idx
  on public.restaurant_tables (restaurant_id, is_active);

create index if not exists table_sessions_table_expiry_idx
  on public.table_sessions (table_id, expires_at);

create index if not exists table_sessions_active_expiry_idx
  on public.table_sessions (expires_at)
  where revoked_at is null;

alter table public.restaurant_tables enable row level security;
alter table public.table_sessions enable row level security;

-- Deliberately create NO anon/authenticated policies.
-- Browser clients must not read or modify QR hashes or session hashes.
-- The trusted Edge Function will access these tables using server-side credentials.

commit;