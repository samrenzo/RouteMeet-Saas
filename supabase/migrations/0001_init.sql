-- RouteMeet — Phase 0 schema
-- Run via: supabase db push  (or paste into the Supabase SQL editor)

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------
-- businesses: one row per owner account
-- ---------------------------------------------------------------------
create table if not exists businesses (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  home_base_address text,
  home_base_lat double precision,
  home_base_lng double precision,
  timezone text not null default 'America/New_York',
  plan text not null default 'free' check (plan in ('free', 'pro', 'business')),
  google_refresh_token text, -- encrypted at rest by Supabase; used in Phase 2
  created_at timestamptz not null default now()
);

create index if not exists businesses_owner_user_id_idx on businesses(owner_user_id);

-- ---------------------------------------------------------------------
-- clients: deduplicated CRM record per business (Phase 5 builds the UI)
-- ---------------------------------------------------------------------
create table if not exists clients (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create index if not exists clients_business_id_idx on clients(business_id);
create unique index if not exists clients_business_email_idx
  on clients(business_id, email) where email is not null;

-- ---------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------
create table if not exists bookings (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  client_name text not null,
  client_email text not null,
  client_phone text,
  location_type text not null check (location_type in ('virtual', 'in_person')),
  address text,
  lat double precision,
  lng double precision,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  meet_link text,
  event_id text,
  reminder_sent boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  constraint end_after_start check (end_time > start_time),
  constraint in_person_needs_address check (
    location_type = 'virtual' or address is not null
  )
);

create index if not exists bookings_business_id_idx on bookings(business_id);
create index if not exists bookings_start_time_idx on bookings(start_time);
create index if not exists bookings_business_status_idx on bookings(business_id, status);

-- ---------------------------------------------------------------------
-- business_hours: weekly recurring availability
-- ---------------------------------------------------------------------
create table if not exists business_hours (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  constraint end_after_start_hours check (end_time > start_time)
);

create index if not exists business_hours_business_id_idx on business_hours(business_id);
create unique index if not exists business_hours_unique_day
  on business_hours(business_id, day_of_week);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table businesses enable row level security;
alter table clients enable row level security;
alter table bookings enable row level security;
alter table business_hours enable row level security;

-- Owners can fully manage their own business row.
create policy "Owners manage their own business"
  on businesses for all
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

-- Anyone (including anon, for the public booking page) can read the
-- minimal business fields needed to render /book/[slug]. We only ever
-- select non-sensitive columns from client code for anon reads.
create policy "Public can read businesses for booking pages"
  on businesses for select
  using (true);

-- Owners manage their own clients.
create policy "Owners manage their own clients"
  on clients for all
  using (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  )
  with check (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  );

-- Owners manage bookings for their business.
create policy "Owners manage their own bookings"
  on bookings for all
  using (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  )
  with check (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  );

-- Public (anon) can INSERT a booking — this is how clients book. They
-- cannot select, update, or delete existing bookings.
create policy "Public can create bookings"
  on bookings for insert
  with check (status = 'pending');

-- Public can read business_hours to compute available slots.
create policy "Public can read business hours"
  on business_hours for select
  using (true);

create policy "Owners manage their own business hours"
  on business_hours for insert
  with check (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  );

create policy "Owners update their own business hours"
  on business_hours for update
  using (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  )
  with check (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  );

create policy "Owners delete their own business hours"
  on business_hours for delete
  using (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  );
