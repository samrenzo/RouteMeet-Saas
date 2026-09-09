-- RouteMeet — Phase 8: onboarding flow

alter table businesses
  add column if not exists onboarding_completed boolean not null default false;
