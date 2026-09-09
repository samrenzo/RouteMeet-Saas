-- RouteMeet — Phase 7 schema additions: Stripe billing

alter table businesses
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists bookings_this_month integer not null default 0;

create index if not exists businesses_stripe_customer_id_idx
  on businesses(stripe_customer_id);
