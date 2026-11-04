-- Mughal E Raj Owner Data Entry System
-- Review this SQL before running it in Supabase SQL Editor.
-- It creates a separate table and does not alter existing orders/menu/dashboard tables.

create table if not exists public.owner_business_records (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  record_type text not null check (record_type in (
    'profit_loss','menu_engineering','inventory','food_wastage',
    'customer_analytics','feedback','staff_performance','promotions',
    'forecasting','operating_expenses','tax_finance','alerts'
  )),
  record_date date not null default current_date,
  title text not null check (char_length(trim(title)) between 1 and 160),
  amount_paise bigint null check (amount_paise is null or amount_paise >= 0),
  details jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists owner_business_records_restaurant_type_date_idx
  on public.owner_business_records (restaurant_id, record_type, record_date desc);

alter table public.owner_business_records enable row level security;

-- Owners can read only their restaurant's records.
drop policy if exists "owner reads own business records" on public.owner_business_records;
create policy "owner reads own business records"
on public.owner_business_records for select to authenticated
using (
  exists (
    select 1 from public.staff_members s
    where s.user_id = (select auth.uid())
      and s.restaurant_id = owner_business_records.restaurant_id
      and s.role = 'owner'
      and s.is_active = true
  )
);

-- Only an active owner can add records for their restaurant, and created_by must be them.
drop policy if exists "owner inserts own business records" on public.owner_business_records;
create policy "owner inserts own business records"
on public.owner_business_records for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.staff_members s
    where s.user_id = (select auth.uid())
      and s.restaurant_id = owner_business_records.restaurant_id
      and s.role = 'owner'
      and s.is_active = true
  )
);

-- Owner-only edits/deletes are intentionally not enabled in this first version.
-- This initial version supports creating and viewing records; edit/delete can be added after testing.
grant select, insert on public.owner_business_records to authenticated;