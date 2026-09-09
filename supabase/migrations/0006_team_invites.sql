-- RouteMeet — Phase 7: multi-user placeholder
--
-- NOTE: this table only records invite intent (an email + timestamp). It
-- does NOT implement actual multi-user login — this schema still ties
-- exactly one auth.users row (owner_user_id) to each business throughout
-- the app. Building real multi-user access would mean a separate
-- business_members table, changing every RLS policy that currently checks
-- `owner_user_id = auth.uid()` to check membership instead, and an invite
-- acceptance flow. That's a bigger change than fits this phase — see the
-- README's Phase 7 section for what's built vs. deferred.

create table if not exists team_invites (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  email text not null,
  invited_at timestamptz not null default now()
);

create index if not exists team_invites_business_id_idx on team_invites(business_id);

alter table team_invites enable row level security;

create policy "Owners manage their own team invites"
  on team_invites for all
  using (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  )
  with check (
    business_id in (select id from businesses where owner_user_id = auth.uid())
  );
