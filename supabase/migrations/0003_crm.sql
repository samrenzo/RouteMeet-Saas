-- RouteMeet — Phase 5 schema additions: CRM notes + tags

alter table clients
  add column if not exists tags text[] not null default '{}';

create table if not exists client_notes (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  booking_id uuid references bookings(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists client_notes_client_id_idx on client_notes(client_id);
create index if not exists client_notes_business_id_idx on client_notes(business_id);

alter table client_notes enable row level security;

create policy "Owners manage their own client notes"
  on client_notes for all
  using (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  )
  with check (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  );
