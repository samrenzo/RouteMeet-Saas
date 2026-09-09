-- RouteMeet — Phase 4 schema additions: notification preferences

alter table businesses
  add column if not exists notify_email boolean not null default true,
  add column if not exists notify_sms boolean not null default false,
  add column if not exists notify_whatsapp boolean not null default false,
  add column if not exists notify_push boolean not null default true,
  add column if not exists owner_phone text,
  add column if not exists owner_email text;

-- Backfill owner_email for any businesses created before this column
-- existed, from auth.users (requires running as a role with access to the
-- auth schema — the Supabase SQL editor has this by default).
update businesses b
set owner_email = u.email
from auth.users u
where b.owner_user_id = u.id and b.owner_email is null;

-- Separate from `reminder_sent` (used for the 2-hour SMS reminder) so the
-- 15-minute push reminder can be tracked independently — a booking can be
-- due for one and not the other depending on when cron last ran.
alter table bookings
  add column if not exists push_reminder_sent boolean not null default false;
