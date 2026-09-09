-- RouteMeet — Phase 6 schema additions: route stats history for analytics

create table if not exists route_stats (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  route_date date not null,
  naive_seconds integer not null,
  optimized_seconds integer not null,
  stop_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, route_date)
);

create index if not exists route_stats_business_date_idx
  on route_stats(business_id, route_date);

alter table route_stats enable row level security;

create policy "Owners read their own route stats"
  on route_stats for select
  using (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  );

-- Written by computeAndPersistRoute (server-side, service-role or the
-- authenticated owner's own session) — no public insert/update policy
-- needed since it's never called from client-reachable, unauthenticated
-- code paths.
create policy "Owners write their own route stats"
  on route_stats for insert
  with check (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  );

create policy "Service role writes route stats from cron"
  on route_stats for all
  to service_role
  using (true)
  with check (true);

create policy "Owners upsert their own route stats"
  on route_stats for update
  using (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  )
  with check (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  );
