# RouteMeet

Booking + AI route optimization for small business owners who juggle virtual
and in-person client meetings.

**Status: all 8 phases of the original build spec are implemented, and a
full post-build bug/security review has been done and acted on** (see
below). This was built phase by phase in a sandbox with no network
access — meaning none of it has been run, `npm install`ed, or tested
against real Supabase/Google/Stripe/etc. credentials. Treat this as a
complete, carefully-reasoned-through first draft, not a verified one.
Each phase below lists what it covers and what's still a placeholder or
known simplification; the [Setup](#setup) section has a step-by-step
verification checklist per phase — **run through those before trusting
any of this with a real business's data.**

---

## Post-build review: what was found and fixed

After all 8 phases were built, I went through the whole codebase
specifically hunting for bugs — re-reading every RLS policy against every
query that uses it, checking third-party API payload shapes against
current docs, and tracing which Supabase client (session-scoped vs.
service-role) each code path actually runs with. Three of the findings
were serious enough that they'd have broken the app for real users, not
just edge cases, so they're called out here rather than buried in a
changelog:

1. **The public booking flow was silently broken for real (non-owner)
   visitors.** `computeAvailableSlots`, the client-dedupe upsert, and the
   booking insert's return value all read/wrote tables (`bookings`,
   `clients`) that have RLS policies granting access to business owners
   only — correct for the dashboard, but the public booking page and its
   server action were using the same session-scoped client an anonymous
   visitor gets (no grant at all). Under RLS this doesn't error, it just
   silently returns nothing or denies the write, which meant: double-
   booking prevention never actually excluded anything for a real visitor,
   and client-record creation would have thrown on every single public
   booking (Supabase's `.insert().select()` also implicitly requires a
   SELECT policy to return the new row — `bookings` has none for the
   public role, which is correct, but meant the code needed to stop
   relying on that return value). Fixed by moving every read/write in this
   path that a real anonymous visitor needs to the service-role client,
   except the actual `bookings` INSERT itself, which intentionally still
   goes through the narrow public policy as the real enforcement boundary.
   See `src/app/book/[businessSlug]/actions.ts` and `page.tsx`.
2. **The route-optimization crons would have silently done nothing.**
   `computeAndPersistRoute` is shared between the authenticated
   "Recompute" button and the 6 AM/6:30 AM cron jobs — but cron requests
   carry no user session at all, and the function was hardcoded to the
   session-scoped client. Every read/write inside it (businesses,
   bookings, business_hours, route_stats) would have failed RLS silently
   the moment a cron actually ran. Fixed by giving the function an
   injectable Supabase client, with both cron routes now explicitly
   passing their own service-role client through.
3. **`businesses`' public RLS policy exposed sensitive columns to anyone
   with the public anon key**, not just the `name`/`slug` the booking page
   actually needed — RLS is row-level, not column-level, so `using (true)`
   on SELECT meant `google_refresh_token`, `stripe_customer_id`,
   `stripe_subscription_id`, `owner_phone`, and `owner_email` were all
   readable by anyone who queried the table directly with the
   (necessarily public) anon key, bypassing the app entirely. Fixed by
   dropping that policy (`supabase/migrations/0008_security_fixes.sql`)
   now that the app's own public-facing code no longer depends on it.

A few smaller but real bugs, also fixed:

- **OneSignal's REST API call used the wrong auth header** (`Basic` instead
  of `Key`) and the legacy `onesignal.com/api/v1/` host instead of the
  current `api.onesignal.com` — every server-sent push would have failed
  outright. Verified against OneSignal's current docs and fixed in
  `src/lib/push.ts`.
- **A downgraded business could get permanently stuck unable to save any
  notification preference.** If SMS/WhatsApp were on before a downgrade,
  the Settings form loaded with those checkboxes checked-and-disabled, and
  saving anything else kept resubmitting `true` values the server now
  (correctly) rejects. Fixed by clamping those fields to `false` on load
  for non-Business plans (`notification-preferences-form.tsx`), and — the
  more important half of this fix — by enforcing the plan check inside
  `lib/sms.ts` itself, at the point messages actually get sent, not just
  at the Settings-save boundary. Without that second part, a business that
  downgraded via the Stripe portal (never touching the Settings form at
  all) would have kept receiving a paid feature for free indefinitely.
- **`crypto.randomUUID()` was called as a bare global** in two
  server-side files. It's a real Web Crypto API, but relying on it being
  globally available in Node without an import is a version-dependent
  assumption not worth making; switched to `import { randomUUID } from
  "crypto"` in both spots.
- **`findAvailableSlug`'s slug-uniqueness check** (used when a new owner's
  name collides with an existing business's) reads across *other* owners'
  rows by design — it was relying on the since-removed public `businesses`
  policy to do that. Fixed to use the service-role client explicitly,
  since checking global uniqueness is a legitimate system-level operation
  regardless of who's signed in.

**What this review did not do**: run any of it. Every fix above was found
by re-reading the code against RLS policies, current third-party API docs,
and each other — not by executing anything, since this sandbox still has
no network access. The verification checklists below remain the real test.

---

## What's implemented (Phase 2 — Calendar + Meet)

- `src/lib/googleCalendar.ts`: exchanges the stored refresh token for an
  access token, then creates/patches/deletes Calendar events and queries
  freebusy — all direct `fetch` calls against the Calendar REST API (no
  `googleapis` SDK dependency).
- **Confirm** (`src/app/dashboard/actions.ts`) now creates a real Calendar
  event on confirmation: virtual bookings get `conferenceData.createRequest`
  so Google mints a Meet link, which is saved to `bookings.meet_link`;
  in-person bookings get a plain event with the address as `location`. The
  client is added as an attendee either way, so they get a native Calendar
  invite. The returned `event_id` is stored on the booking.
- **Cancel** now deletes the linked Calendar event first (best-effort —
  a Calendar error won't block cancelling in RouteMeet itself).
- The public booking page and the booking-creation server action both now
  call `freebusy.query` on the owner's calendar and merge it with existing
  RouteMeet bookings, so slots that are busy on the owner's *real* calendar
  (meetings booked outside RouteMeet, personal events, etc.) are excluded
  too — closing the double-booking gap Phase 1 explicitly left open.
- Dashboard shows a **Join Meeting** button on confirmed virtual bookings
  that have a `meet_link`.
- If an owner hasn't connected Google (no `google_refresh_token` on file —
  shouldn't normally happen since `/login` requests Calendar scopes, but
  can happen if they revoked access), Confirm still works and just skips
  Calendar, so a Google outage or revoked grant can't block them from
  managing bookings.

**Not yet built in Phase 2**: rescheduling an existing booking to a new
time (only cancel-and-rebook exists so far); Phase 3 adds the pieces that
would make a real reschedule flow (re-timing via route optimization,
`patchCalendarEventTime` is already written and ready for that).

---

## What's implemented (Phase 3 — Route Optimization)

- `src/lib/geocode.ts`: Google Geocoding API wrapper. Called both when an
  in-person booking is **confirmed** (`src/app/dashboard/actions.ts`) and
  when a home base address is saved in **Settings** — so both ends of every
  route always have coordinates without a separate backfill step.
- `src/lib/distanceMatrix.ts`: builds the full home-base + stops travel-time
  matrix in a single Distance Matrix API call (origins = destinations = all
  points), capped at Google's 25-point limit — more than enough for a
  single day's stops.
- `src/lib/routeOptimizer.ts`: nearest-neighbor construction from home base,
  then a 2-opt improvement pass over the resulting open path (no dependency
  on `googleapis` or any optimization library — plain TypeScript).
- `src/lib/routeService.ts` (`computeAndPersistRoute`): the Phase 3 core —
  pulls the day's confirmed in-person bookings, optimizes order, computes
  arrival/departure times (anchored to the owner's normal opening time for
  that weekday, walking forward through travel time + a configurable
  buffer — default 15 min — plus each booking's own duration), **writes the
  new `start_time`/`end_time` back to Supabase**, and patches the linked
  Google Calendar event via `patchCalendarEventTime` for each moved stop.
- `GET /api/route/[date]`: authenticated endpoint the dashboard calls;
  returns the computed route (and persists it as a side effect, matching
  the spec).
- `GET /api/cron/precompute-routes`: the 6 AM Vercel Cron target (see
  `vercel.json`) — finds every business with a confirmed in-person booking
  today and recomputes their route, protected by a `CRON_SECRET` bearer
  check.
- `/dashboard/route` ("Today's Route"): date picker + Recompute button, a
  Google Maps JS map with numbered markers and a drawn Directions route
  (`components/route/route-map.tsx`), and a numbered stop list with arrival
  times, travel time from the previous stop, and a **Start Navigation**
  button per stop that opens Google Maps directions
  (`components/route/route-list.tsx`).

**Not yet built in Phase 3 / left as noted simplifications**: the cron's
"today" is computed in UTC rather than per-business timezone (fine for one
timezone's worth of owners; revisit with multiple cron entries if you have
owners spread across timezones); route optimization isn't yet gated by
plan (that's Phase 7); if the Distance Matrix API can't find a route
between a pair, that leg is currently treated as unreachable (`Infinity`)
rather than retried.

---

## What's implemented (Phase 4 — Notifications)

- `src/lib/email.ts` (Resend): client always gets a "request received" email
  on booking, and a "confirmed" email (with Meet link if virtual) when the
  owner confirms — both core transactional and **not** gated by
  preferences. The owner's own copy of that confirmation, plus the daily
  itinerary email, **are** gated by `notify_email`.
- `src/lib/sms.ts` (Twilio): client SMS reminder ~2 hours before their
  meeting, gated by `notify_sms` and requires the client gave a phone
  number at booking. Owner morning WhatsApp route summary, gated by
  `notify_whatsapp` and requires `owner_phone` in Settings.
- `src/lib/push.ts` + `components/dashboard/push-registration.tsx`
  (OneSignal): the dashboard registers the owner's browser against
  OneSignal using their Supabase user id as `external_id` on load, so
  server-side sends don't need to track player ids separately. Instant
  push on new booking, and a push ~15 minutes before each meeting — both
  gated by `notify_push`.
- `GET /api/cron/reminders` (every 15 min): finds bookings 105-135 minutes
  out with `reminder_sent = false` → sends the SMS reminder, marks sent;
  separately finds bookings 10-20 minutes out with `push_reminder_sent =
  false` → sends the push, marks sent. Two independent windows/flags so
  one channel's cadence can't block the other.
- `GET /api/cron/daily-summary` (6:30 AM, 30 min after Phase 3's route
  precompute): for every business with a confirmed booking today, sends
  the itinerary email and WhatsApp summary.
- `/dashboard/settings` now has a **Notification preferences** section:
  toggles for Email/SMS/WhatsApp/Push plus an owner phone number field.

**Interpretation note (spec was underspecified here):** the four toggles
are read as *master switches per channel for the owner's own
notifications/summaries*, not as permission to suppress the client's core
transactional emails (a client should always know their booking was
received/confirmed regardless of the owner's preferences). `notify_sms`
happens to also gate the *client's* SMS reminder since SMS-to-clients is
the only SMS use case Phase 4 defines — see the docstrings in `lib/sms.ts`
and `lib/email.ts` if you want to change this split.

**Not yet built in Phase 4**: plan-based gating of SMS/WhatsApp (Free tier
excludes them per the spec) — that's Phase 7; a way to edit/verify the
owner's own phone number format (E.164 isn't validated beyond "non-empty");
retry/backoff for failed sends (each is logged and skipped, not retried
next cron run since the `*_sent` flag isn't set until success — so a
failure **will** be retried on the next cron tick automatically, just not
within the same run).

---

## What's implemented (Phase 5 — Client CRM + AI Follow-Up Notes)

- `src/lib/clients.ts` (`upsertClientForBooking`): every booking now finds
  or creates a `clients` row keyed by email (bookings always collect an
  email; that's the same key the Phase 0 unique index already enforces),
  and links it via `bookings.client_id` — this was a gap left open since
  Phase 1, where `client_id` existed on the schema but was never populated.
- `/dashboard/clients`: every client, deduplicated, with a booking count
  and last-booking date computed from their booking history, plus a tag
  filter bar.
- `/dashboard/clients/[clientId]`: full booking history, an editable
  multi-select of tags (`Hot lead` / `Follow-up needed` / `Closed` —
  `AVAILABLE_TAGS` in `app/dashboard/clients/actions.ts` if you want to
  change the set), and the append-only notes log.
- Notes are their own table (`client_notes`), not a field on `bookings` —
  intentional, since a client can accumulate notes across many meetings
  and the spec calls for a timestamped *log*, not a single field.
- Dashboard home now shows **"Add notes for your meeting with X?"** prompts
  for any confirmed booking that ended in the last 7 days and has no note
  yet (`components/dashboard/post-meeting-prompts.tsx`) — dismissible,
  and disappears once a note is saved (checked via a left-join on
  `client_notes` so it's a single query, not N+1).
- `src/lib/anthropic.ts`: calls the Claude API directly via `fetch` (no
  SDK dependency, consistent with the rest of the integrations) to turn a
  note's text into a short follow-up email draft. **Check
  https://docs.claude.com/en/docs/about-claude/models for the current
  recommended model id before deploying** — `DEFAULT_MODEL` is a
  placeholder, override via `ANTHROPIC_MODEL` if needed.
- **Draft Follow-Up Email** button per note (`components/clients/notes-section.tsx`):
  calls Claude, shows the draft in an editable subject + textarea, and only
  sends (via Resend, `lib/email.ts#sendFollowUpEmail`) when the owner
  clicks Send — nothing goes out un-reviewed.

**Not yet built in Phase 5**: bulk actions on the Clients list (e.g. tag
multiple at once); a way to edit or delete a note once saved (matches the
spec's "append-only" framing, but means a typo lives forever — worth a
follow-up if that's too strict in practice); AI drafting isn't rate-limited
per business, so a chatty owner could run up an Anthropic bill — fine at
the "~20 active businesses" scale from the spec's launch-readiness check,
worth revisiting before a bigger launch.

---

## What's implemented (Phase 6 — Dashboard Polish + Analytics)

- **Mission Control** (`/dashboard` redesign): quick-stat cards (meetings
  this week, no-show rate over the last 4 weeks, average travel time saved
  per day — `src/lib/stats.ts#getQuickStats`), a "Next up" widget with
  Join Meeting / Get Directions actions, a compact "Today's route" list,
  the booking-link + QR widget, then the existing full bookings list below.
- **Today's route widget is intentionally read-only** — it displays
  whatever order was last computed (by the 6 AM cron or a visit to
  `/dashboard/route`) rather than calling `computeAndPersistRoute` on
  every dashboard load, which would mean a Distance Matrix + Geocoding
  round trip every time the owner opens their dashboard. Full recompute
  still lives on `/dashboard/route`.
- **Mark as no-show**: a button on past confirmed bookings
  (`markNoShow` in `src/app/dashboard/actions.ts`) sets `status =
  "no_show"` without touching the linked Calendar event — feeds the
  no-show rate stat.
- `route_stats` table (new migration): every time `computeAndPersistRoute`
  runs, it now also upserts that day's naive-vs-optimized travel time —
  this is what powers both the Mission Control "avg travel time saved"
  stat and the analytics line chart. Without logging this over time,
  there'd be no way to show a trend, only "today's" number.
- `/dashboard/analytics`: three Recharts visualizations — meetings per
  week (bar), virtual vs. in-person split (donut), travel time saved per
  week (line). Each is its own async server component wrapped in its own
  `<Suspense>` with a skeleton fallback, so the page streams in
  section-by-section instead of blocking on the slowest query.
- Shareable booking link widget (`components/settings/booking-link-widget.tsx`):
  copy-to-clipboard + a QR code generated client-side with the `qrcode`
  package. Used on both Mission Control and Settings.
- Existing "No bookings yet" empty state (Phase 1) and new analytics
  skeletons/empty-per-chart states satisfy the Phase 6 empty-state/loading
  requirement — no separate work needed for the bookings list itself.

**Not yet built in Phase 6**: a way to un-mark a no-show (owner has to go
into Supabase directly if they misclick); the analytics date range is
fixed at 8 weeks / 4 weeks (not user-adjustable); "meetings this week"
uses the server's week-start convention (Sunday, from `date-fns`'s
default) rather than a per-business locale setting.

---

## What's implemented (Phase 7 — Monetization with Stripe)

- `src/lib/plans.ts`: the single source of truth for what each tier
  includes. Every gating check elsewhere reads from this object rather
  than hardcoding plan names.
- `src/lib/stripe.ts` + `POST /api/webhooks/stripe`: Checkout session
  creation (subscription mode), a Billing Portal session for
  self-service management/cancellation, and webhook handling for
  `checkout.session.completed` (sets the plan + stores customer/
  subscription ids), `customer.subscription.updated` (keeps `plan` in
  sync if the owner changes tiers from the Stripe portal), and
  `customer.subscription.deleted` (drops back to `free`).
- `/pricing`: public tier comparison generated from `lib/plans.ts`;
  Upgrade buttons kick off Checkout. `/dashboard/billing`: current plan,
  usage vs. the Free-tier limit (progress bar), Manage Subscription button.
- **Feature gating, enforced server-side (not just hidden in the UI):**
  - *Free, 10+ bookings this month* → the booking page shows a "temporarily
    unavailable" message instead of the booking form; the server action
    also re-checks and rejects even if the page was cached.
  - *Free* → the in-person meeting toggle is hidden on the booking page,
    and rejected server-side if forced.
  - *Free* → "Today's Route" nav link is hidden, `/api/route/[date]`
    returns 403 with `upgradeRequired: true`, and the dashboard shows an
    upsell instead of an error. Both route-related crons skip Free
    businesses too.
  - *Not Business* → SMS/WhatsApp toggles are disabled in Settings and
    rejected server-side; the AI "Draft Follow-Up Email" button is
    disabled with an upgrade link, and the server action rejects the call
    directly (not just relying on the UI not showing the button).
- `bookings_this_month` counter (schema) + `GET /api/cron/reset-booking-counts`
  (1st of each month): the spec calls for a stored counter + reset cron
  rather than dynamically counting rows each time, so that's what's built
  — see the Known Limitations note on why a dynamic count would be more
  drift-proof if you'd rather simplify this later.
- **Multi-user is a placeholder, not a real feature** — a `team_invites`
  table records intent (email + timestamp) and the Settings UI gates it to
  Business plan, but there's no actual second-login capability. This
  schema still ties exactly one `auth.users` row (`owner_user_id`) to each
  business everywhere — RLS policies, the dashboard layout, all of it.
  Real multi-user needs a `business_members` table, every `owner_user_id =
  auth.uid()` RLS check rewritten to a membership check, and an invite
  acceptance flow. That's a genuinely separate project of work, not
  something to half-do inside this phase — see the comment in
  `supabase/migrations/0006_team_invites.sql` for the same note in context.

**Not yet built in Phase 7**: proration/plan-change UI beyond what
Stripe's own Billing Portal provides; a webhook handler for failed
payments (`invoice.payment_failed`) — right now a failed card just rides
out the subscription's normal `past_due` → `canceled` lifecycle and gets
picked up by the `customer.subscription.deleted` handler eventually,
with no earlier warning email to the owner.

---

## What's implemented (Phase 8 — Launch Readiness)

- **Landing page** (`/`, replaces the Phase 0 placeholder): hero, four
  feature-highlight cards, a pricing section pulling live from
  `lib/plans.ts` (so it can't drift from what `/pricing` and the billing
  gates actually enforce), and a Google sign-in CTA. SEO metadata (title,
  description, Open Graph, Twitter card) via Next's `Metadata` API.
- **Onboarding flow**: first sign-in now routes to `/onboarding` instead
  of straight to `/dashboard` (`onboarding_completed` flag on
  `businesses`, checked in the auth callback and again in the dashboard
  layout as a safety net). Three steps — business basics (reuses the
  geocoding-on-save logic from Settings), weekly availability (reuses
  `BusinessHoursForm` as-is), then the booking-link/QR widget with a
  "Go to dashboard" finish button that flips the flag.
- **Rate limiting** on booking creation (`src/lib/rateLimit.ts`, applied
  in `book/[businessSlug]/actions.ts`): 5 attempts/minute per IP. It's a
  plain in-memory limiter with **no external dependency** — deliberately
  simple, but that means it only limits requests landing on the same
  serverless instance and resets on cold start. Fine as a speed bump
  against casual abuse; swap for `@upstash/ratelimit` (Redis-backed) if
  you need it to actually hold under real attack traffic across instances.
- Booking page metadata is now per-business (`generateMetadata` using the
  business name) instead of the generic site-wide title.

**Not built**: CAPTCHA or bot-detection on the booking form (rate limiting
alone doesn't stop a distributed scraper — that's a separate, larger
piece of work); a way to redo onboarding if an owner wants to; localized
landing page copy.

### Free-tier usage check (against the spec's ~20-active-businesses target)

I searched for each service's *current* free-tier terms rather than relying
on possibly-stale assumptions, since these change over time and the
original spec's own reference point (Google's flat $200/month Maps credit)
turned out to already be one of them:

- **Google Maps Platform** — the flat $200/month credit was retired in
  March 2025. It's now per-SKU free monthly allowances (commonly cited as
  ~10,000 free events/month for Essentials-tier SKUs like Geocoding and
  Maps JavaScript "Dynamic Maps" loads, lower for Pro-tier SKUs like
  Distance Matrix and Directions). At 20 businesses averaging even a
  modest handful of in-person stops on their busiest days, geocoding +
  Distance Matrix + Directions + Maps JS loads combined could plausibly
  exceed the free allowance on the Pro-tier SKUs specifically, while
  Geocoding alone likely stays comfortably under its own allowance.
  **Verify current numbers at
  [mapsplatform.google.com/pricing](https://mapsplatform.google.com/pricing)
  before launch** — this is the one place the original spec's assumption
  is outdated, not just a rough estimate.
- **Resend** — free tier is 3,000 emails/month **and a 100/day cap** (the
  daily cap, not the monthly one, is what a real launch hits first). Each
  booking round-trip alone sends 2 emails (request received + confirmed);
  add the daily itinerary email and any follow-up drafts, and 20 active
  businesses each running a handful of bookings a day can realistically
  clear 100 emails/day well before the month is over. Budget for
  Resend's paid tier ($20/month for 50,000/month, no stated daily cap) if
  you're onboarding real businesses rather than testing.
- **Supabase** — free tier is ~500 MB database, 50,000 monthly active
  users (Auth), a few GB of egress, and (notably) **free projects pause
  after 7 days with no API activity**. The cron jobs here ping the
  database daily-at-minimum, which should keep a live project out of that
  state, but it's worth knowing about if you spin up a project and don't
  wire up cron/traffic to it right away. Database size and MAU are both
  non-issues at 20 businesses.
- **Vercel Cron** — this is the one that actually blocks a straightforward
  Hobby-plan deploy: **Hobby accounts can only run cron jobs once per
  day**, full stop. `precompute-routes` (6 AM) and `daily-summary`
  (6:30 AM) and `reset-booking-counts` (1st of month) are all daily and
  deploy fine on Hobby. **`reminders` (every 15 minutes) will fail to
  deploy on Hobby** — Vercel rejects the cron expression outright. Either
  upgrade that project to Vercel Pro, or keep the app on Hobby and trigger
  `/api/cron/reminders` from an external scheduler (e.g. GitHub Actions
  on a schedule, or a service like cron-job.org) hitting the endpoint with
  the `CRON_SECRET` bearer header instead of relying on `vercel.json`.

None of the above are hard blockers — they're exactly the kind of thing
the spec asked to have flagged before onboarding real businesses, so
here it is.

---

## What's implemented (Phase 0 + 1)

- Next.js 14 App Router + TypeScript + Tailwind + hand-rolled shadcn/ui-style
  primitives (`src/components/ui`)
- Supabase Postgres schema: `businesses`, `clients`, `bookings`,
  `business_hours`, with Row Level Security policies
  (`supabase/migrations/0001_init.sql`)
- Supabase Auth with Google OAuth sign-in (`/login`, `/auth/callback`) —
  already requests the Calendar scopes Phase 2 will need, and stores the
  Google refresh token on first consent, so owners won't get a second
  consent screen later
- Public booking page `/book/[businessSlug]`:
  - Computes open slots from the owner's weekly `business_hours`
  - Excludes times already taken by a pending/confirmed booking
  - Client picks a day + time, enters their details, chooses
    virtual/in-person (+ address), submits → row created with
    `status = "pending"`
- Owner dashboard `/dashboard`:
  - Upcoming bookings grouped by day, in a route-style timeline
  - Confirm / Cancel actions (Phase 2 wires Confirm into Calendar + Meet
    link creation)
  - `/dashboard/settings`: business name, home base address, timezone, and
    a weekly availability editor

**Intentionally not yet built** (see spec): Calendar/Meet integration behind
the Confirm button, route optimization, email/SMS/WhatsApp/push, CRM notes,
analytics, Stripe billing, and the marketing landing page. `confirmBooking`
in `src/app/dashboard/actions.ts` and the profile update in
`src/app/dashboard/settings/actions.ts` both have comments marking the exact
spot Phase 2/3 hook in.

---

## Setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run the migrations in `supabase/migrations/` in
   order: `0001_init.sql` through `0008_security_fixes.sql` (or install
   the Supabase CLI and run `supabase db push` after `supabase link`).
3. In **Authentication → Providers → Google**, enable Google sign-in.
   You'll need a Google Cloud OAuth Client ID/Secret (see next section) —
   paste them here, and set the redirect URL Supabase gives you.
4. Copy **Project URL**, **anon public key**, and **service_role key** into
   your `.env.local` (see `.env.example`).

### 2. Google Cloud Console

1. Create a project (or reuse one) at
   [console.cloud.google.com](https://console.cloud.google.com).
2. **APIs & Services → OAuth consent screen**: configure it (internal or
   external, per your Workspace setup).
3. **APIs & Services → Credentials → Create OAuth client ID** (type: Web
   application). Add Supabase's callback URL (from the Google provider
   screen in step 1.3 above) as an authorized redirect URI.
4. Paste the generated Client ID/Secret into Supabase's Google provider
   settings, **and** into this app's own `.env.local` as
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Supabase uses it for the
   initial sign-in exchange, but `src/lib/googleCalendar.ts` also exchanges
   the stored refresh token for fresh access tokens directly against the
   same client, so both places need it.
5. **APIs & Services → Library**: enable **Google Calendar API**,
   **Geocoding API**, **Distance Matrix API**, **Directions API**, and
   **Maps JavaScript API**.
6. **APIs & Services → Credentials → Create API key** (a plain API key, not
   OAuth) for server-side calls. Restrict it to Geocoding API + Distance
   Matrix API, and to your server's IP if you can. Put it in `.env.local`
   as `GOOGLE_MAPS_API_KEY`.
7. Create a **second** API key for the browser-side Maps JavaScript API +
   Directions rendering. Restrict it by **HTTP referrer** to your domain(s)
   — this one ships in page source, so it must not carry the same broad
   permissions as the server key. Put it in `.env.local` as
   `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
8. Generate a random string for `CRON_SECRET` in `.env.local` — this
   protects `/api/cron/precompute-routes` from being called by anyone but
   Vercel Cron. On Vercel, cron requests are sent with
   `Authorization: Bearer <CRON_SECRET>` automatically once the same value
   is set as a Vercel environment variable and `vercel.json`'s `crons`
   entry is deployed.

### 3. Resend, Twilio, OneSignal

1. **Resend**: create an account, verify a sending domain (or use their
   test domain while developing), create an API key. Set `RESEND_API_KEY`
   and `RESEND_FROM_EMAIL` (must be an address on the verified domain).
2. **Twilio**: create an account, note your Account SID + Auth Token
   (`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`). For SMS, buy a number and
   set `TWILIO_FROM_NUMBER`. For WhatsApp while developing, join Twilio's
   WhatsApp Sandbox and set `TWILIO_WHATSAPP_FROM` to the sandbox number
   (no `whatsapp:` prefix — the code adds it); in production, apply for a
   WhatsApp Business sender instead.
3. **OneSignal**: create an app configured for Web Push, grab the App ID
   and a REST API key. Set `ONESIGNAL_APP_ID`, `ONESIGNAL_API_KEY`, and
   `NEXT_PUBLIC_ONESIGNAL_APP_ID` (same app id, exposed to the browser SDK).
   For local dev over `http://localhost`, OneSignal's "Localhost testing"
   toggle in the app's Web Push settings needs to be on, or use an HTTPS
   tunnel (e.g. ngrok) — browsers won't grant push permission on plain
   HTTP outside localhost exceptions.

### 4. Anthropic

1. Create an API key at [console.anthropic.com](https://console.anthropic.com).
   Set `ANTHROPIC_API_KEY`.
2. Check [docs.claude.com/en/docs/about-claude/models](https://docs.claude.com/en/docs/about-claude/models)
   for the current recommended model id, and set `ANTHROPIC_MODEL` if you
   want to override the default in `src/lib/anthropic.ts`.

### 5. Stripe

1. Create a Stripe account (test mode is fine for development). Grab your
   secret key for `STRIPE_SECRET_KEY`.
2. Under **Products**, create two recurring monthly prices: Pro ($29) and
   Business ($79). Copy each price id (`price_...`) into
   `STRIPE_PRICE_ID_PRO` / `STRIPE_PRICE_ID_BUSINESS`.
3. Webhook setup — two options:
   - **Local dev**: install the [Stripe CLI](https://docs.stripe.com/stripe-cli),
     run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`,
     and use the webhook signing secret it prints for
     `STRIPE_WEBHOOK_SECRET`.
   - **Deployed**: in the Stripe Dashboard under **Developers → Webhooks**,
     add an endpoint at `https://your-domain/api/webhooks/stripe`
     subscribed to `checkout.session.completed`,
     `customer.subscription.updated`, and `customer.subscription.deleted`.
     Copy that endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Enable the **Customer Portal** under **Settings → Billing → Customer
   portal** — `/dashboard/billing`'s "Manage Subscription" button opens
   this, and it needs to be turned on once per Stripe account (test and
   live mode separately).

### 6. Local dev

```bash
npm install
cp .env.example .env.local   # fill in the values from steps 1-3
npm run dev
```

Visit `http://localhost:3000`.

### 7. Verifying Phase 0-1 end to end

1. **Sign in**: go to `/login`, sign in with Google. First sign-in
   auto-creates a `businesses` row (name from your Google profile, a unique
   slug, Mon–Fri 9–5 default hours) and drops you on `/dashboard`.
2. **Settings**: go to `/dashboard/settings`, set your real business name,
   a home base address, timezone, and adjust weekly hours. Save both forms.
3. **Copy your booking link** (shown at the top of Settings) — something
   like `/book/your-business-slug`.
4. **Book as a client**: open that link in an incognito window. Pick a day
   and time (only slots inside the hours you just saved should appear),
   fill in the form, choose virtual or in-person, submit. You should land
   on a confirmation screen.
5. **Confirm as the owner**: back in `/dashboard`, the new booking appears
   under today/tomorrow with status "pending." Click **Confirm** — status
   flips to "confirmed." Click **Cancel** on another booking to verify that
   path too.
6. **Double-booking guard**: book the same slot again from the client link
   — it should no longer appear in the picker (and the server action
   re-validates this even if you somehow force-submit a stale slot).

### 8. Verifying Phase 2 (Calendar + Meet) end to end

1. Confirm a **virtual** booking from `/dashboard` — check the owner's
   actual Google Calendar for a new event with a Meet link, and check the
   client's inbox for a native Calendar invite. The dashboard should now
   show a **Join Meeting** button on that booking.
2. Confirm an **in-person** booking — the Calendar event should show the
   client's address as the event location, no Meet link.
3. **Cancel** a confirmed booking — the Calendar event should disappear
   from the owner's calendar.
4. **Freebusy blocking**: manually create an event on the owner's Google
   Calendar (outside RouteMeet) during a would-be-open slot, then reload
   the booking page — that slot should no longer be offered.

### 9. Verifying Phase 3 (Route Optimization) end to end

1. Make sure Settings has a real, geocodable home base address saved
   (check `businesses.home_base_lat/lng` got populated after saving).
2. Book and confirm **at least 3 in-person** meetings for the same day, at
   addresses spread across town, ideally booked in a deliberately
   inefficient order.
3. Visit `/dashboard/route`, pick that date. You should see: a map with a
   home marker, numbered stop markers, and a drawn driving route; a
   numbered list below with arrival times, travel time from the previous
   stop, and a "saves ~N min" line if the optimized order beats booking
   order.
4. Check Supabase — the reordered bookings' `start_time`/`end_time` should
   now reflect the optimized schedule, and (if Phase 2's Confirm created a
   Calendar event) the owner's Google Calendar should show the updated
   times too.
5. **Cron**: hit `/api/cron/precompute-routes` with
   `Authorization: Bearer <your CRON_SECRET>` manually (e.g. via `curl`) —
   it should recompute today's route for every business with a confirmed
   in-person booking today and return a `{ succeeded, failed }` summary.

### 10. Verifying Phase 4 (Notifications) end to end

1. **Booking request email**: book as a client — check the client's inbox
   for the "request sent" email within a few seconds.
2. **Confirmation emails**: confirm the booking as the owner — the client
   should get a "confirmed" email (with Meet link if virtual); with
   `notify_email` on in Settings, the owner should get their own copy too.
3. **Push**: with the dashboard open in a browser that's granted
   notification permission (check `components/dashboard/push-registration.tsx`
   ran — OneSignal's dashboard shows the subscribed user), book a new
   slot from another browser/incognito window — a push should arrive
   referencing the new booking.
4. **SMS reminder**: temporarily book a slot ~2 hours out with a real
   phone number and `notify_sms` on, then hit
   `/api/cron/reminders` with the `CRON_SECRET` bearer header manually —
   the response should show `sms.sent >= 1` and a text should arrive.
5. **Push reminder**: same idea but book ~15 minutes out and check
   `push.sent` in the same cron response.
6. **Daily summary**: with `owner_phone` set and `notify_whatsapp` on, and
   at least one confirmed booking today, hit `/api/cron/daily-summary`
   manually — the owner should get both the itinerary email and a
   WhatsApp message.

### 11. Verifying Phase 5 (CRM + AI Follow-Ups) end to end

1. Book as a new client, then book again with the **same email** — check
   `/dashboard/clients`: one client row, booking count = 2, not two rows.
2. Open that client's detail page, toggle a couple of tags on — reload
   and confirm they stuck; go to `/dashboard/clients?tag=Hot%20lead` (or
   click the filter pill) and confirm filtering works.
3. Manually set a confirmed booking's `end_time` to a few minutes in the
   past in Supabase, reload `/dashboard` — the "Add notes for your meeting
   with X?" prompt should appear. Add a note; reload — the prompt should
   be gone and the note should show on the client's detail page.
4. On that note, click **Draft Follow-Up Email** — a subject + editable
   body should appear within a few seconds. Edit it, click **Send email**
   — check the client's inbox.

### 12. Verifying Phase 6 (Dashboard Polish + Analytics) end to end

1. Load `/dashboard` — you should see the quick-stat cards, "Next up",
   "Today's route", and the booking-link/QR widget above the full
   bookings list.
2. Pick a past confirmed booking and click **Mark as no-show** — reload
   and check the "No-show rate" stat card moved.
3. Compute a route on `/dashboard/route` for a day with 2+ in-person
   stops (see the Phase 3 checklist), then check Supabase's `route_stats`
   table — a row for that date should exist with `naive_seconds >
   optimized_seconds` (assuming reordering actually helped).
4. Visit `/dashboard/analytics` — all three charts should render (each
   section should briefly show a skeleton first on a slow connection —
   throttle your network in devtools to see it clearly). With no data yet,
   each chart should show its own "no data" message rather than an error
   or a blank chart.
5. Copy the booking link from the widget and confirm it matches
   `/book/your-business-slug`; scan the QR code with a phone camera and
   confirm it opens the same link.

### 13. Verifying Phase 7 (Stripe Billing) end to end

1. On a fresh (Free-plan) business, visit `/dashboard/route` directly —
   you should see the "Route optimization is a Pro feature" upsell, not
   an error, and the nav shouldn't show "Today's Route" at all.
2. In Settings, confirm the SMS/WhatsApp toggles and the phone field are
   disabled with a "Business plan" badge, and the Team section's invite
   button is disabled too.
3. Go to `/pricing`, click **Upgrade to Pro** — you should land on Stripe
   Checkout. Complete it with Stripe's test card (`4242 4242 4242 4242`,
   any future expiry/CVC). You should land back on
   `/dashboard/billing?checkout=success`.
4. Check Supabase — that business's `plan` should now be `pro`,
   `stripe_customer_id` and `stripe_subscription_id` populated. Reload
   `/dashboard` — "Today's Route" should now be in the nav.
5. From `/dashboard/billing`, click **Manage Subscription** — you should
   land in Stripe's Customer Portal. Cancel the subscription there; back
   in RouteMeet, `plan` should revert to `free` once the
   `customer.subscription.deleted` webhook lands (near-instant in test
   mode, but reload if you don't see it right away).
6. Book 10 times against a Free-plan business's booking page (any test
   emails), then try an 11th — you should see "Booking temporarily
   unavailable." Hit `/api/cron/reset-booking-counts` manually with the
   `CRON_SECRET` bearer header — `bookings_this_month` should drop back
   to 0 and the 11th booking should go through.
7. Try booking in-person against a Free-plan business's link directly
   (skip the UI, POST the form fields manually, or just confirm the
   toggle isn't shown) — confirm the option isn't offered.

### 14. Verifying Phase 8 (Launch Readiness) end to end

1. Visit `/` logged out — the landing page should load with the hero,
   feature cards, and pricing section; view page source (or use a social
   share debugger) to confirm the OG title/description are present.
2. Sign in with a **brand-new** Google account (or delete your test
   business row and sign in again) — you should land on `/onboarding`,
   not `/dashboard`. Complete all 3 steps; the final "Go to dashboard"
   click should land you on `/dashboard` and a direct visit to
   `/onboarding` afterward should bounce you back to `/dashboard`.
3. Visit `/book/some-real-slug` and submit 6 booking attempts within a
   minute (any valid-looking data) — the 6th should fail with a
   "Too many booking attempts" error instead of succeeding.
4. Confirm `/book/[businessSlug]` and `/` render distinct `<title>` tags
   (view source or check the browser tab) rather than sharing one generic
   title.

If all of the above works, all 8 phases are verified end to end.

---

## Deploying to Vercel

1. Push this repo to GitHub (or GitLab/Bitbucket), then import it in the
   [Vercel dashboard](https://vercel.com/new).
2. Add every variable from `.env.example` (with real values) under
   **Project Settings → Environment Variables**. Set `NEXT_PUBLIC_APP_URL`
   to your actual production domain once you know it (Vercel assigns one
   on first deploy if you don't have a custom domain yet — you can update
   this and redeploy after).
3. Deploy. `vercel.json`'s `crons` array registers automatically — check
   **Project Settings → Cron Jobs** after deploy to confirm all four show
   up (see the Phase 8 free-tier note above if `reminders` fails to
   register on a Hobby-plan project).
4. Update external callback/webhook URLs to point at your real domain now
   that you have one:
   - Supabase Auth → Google provider's redirect URL (usually already
     Supabase's own domain, not yours — double check either way).
   - Google Cloud Console's OAuth client → authorized redirect URI.
   - Stripe Dashboard → Webhooks → your endpoint URL
     (`https://your-domain/api/webhooks/stripe`), and update
     `STRIPE_WEBHOOK_SECRET` if the signing secret changed.
   - OneSignal → Web Push settings, if it needs your production origin
     allow-listed.
5. Run through the Phase 0-8 verification checklists above against the
   deployed URL, not just locally — cron jobs and webhooks in particular
   only really prove themselves in the deployed environment.

---

## Environment variables (Phase 0-8)

Phase 8 introduces no new environment variables — the landing page,
onboarding flow, and rate limiter are all built from existing config and
plain in-process code. Table unchanged from Phase 0-7:

| Variable | Phase | Where it's used |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 0 | Supabase client (browser + server) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 0 | Supabase client (browser + server) |
| `SUPABASE_SERVICE_ROLE_KEY` | 0/3/4/7 | Privileged server-side work — used by all cron jobs |
| `NEXT_PUBLIC_APP_URL` | 0 | Builds absolute booking links; Stripe Checkout/Portal return URLs |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 2 | Refreshing Google access tokens in `lib/googleCalendar.ts` |
| `GOOGLE_MAPS_API_KEY` | 3 | Geocoding + Distance Matrix (server-side only) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | 3 | Maps JavaScript API + Directions (browser) |
| `CRON_SECRET` | 3/4/7 | Authenticates Vercel Cron calls to all `/api/cron/*` routes |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | 4 | `lib/email.ts` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` / `TWILIO_WHATSAPP_FROM` | 4 | `lib/sms.ts` |
| `ONESIGNAL_APP_ID` / `ONESIGNAL_API_KEY` | 4 | `lib/push.ts` (server-side sends) |
| `NEXT_PUBLIC_ONESIGNAL_APP_ID` | 4 | Browser SDK init (`push-registration.tsx`) |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | 5 | `lib/anthropic.ts` |
| `STRIPE_SECRET_KEY` | 7 | `lib/stripe.ts` (Checkout, Portal, all API calls) |
| `STRIPE_WEBHOOK_SECRET` | 7 | Verifying `/api/webhooks/stripe` signatures |
| `STRIPE_PRICE_ID_PRO` / `STRIPE_PRICE_ID_BUSINESS` | 7 | Which Stripe Price a Checkout session sells |

Later phases' variables are listed (commented out) in `.env.example` so the
shape of the config file doesn't change shape later.

---

## Known limitations at this stage (by design, not bugs)

- Booking slots are 30 minutes fixed (`SLOT_DURATION_MINUTES` in
  `src/lib/slots.ts`).
- The root `/` route is now the real landing page (Phase 8) — nothing
  further planned there, but it's intentionally simple (no animations,
  testimonials, or blog) since that wasn't in scope.
- Rescheduling an existing booking to a specific new time isn't built as
  its own flow yet — only cancel-and-rebook, plus the automatic re-timing
  Phase 3's route optimizer does.
- The Phase 3/4 crons compute "today" in UTC; fine for one timezone's
  worth of owners, revisit with per-timezone cron entries at scale.
- Notes are append-only by design (matches the spec) — there's no edit or
  delete UI yet if a note needs correcting.
- AI drafting has no per-business rate limit; fine at the spec's target
  scale (~20 active businesses), worth adding before a bigger launch.
- Dates/times in emails, SMS, and dashboard UI are formatted in the
  server's local timezone, not `business.timezone` — a real fix means
  threading `utcToZonedTime` through every display point; noted here
  rather than done piecemeal to avoid inconsistent partial fixes.
- No retry queue for failed notifications — a failed send is logged and
  naturally retried on the next cron tick (reminders) or not retried at
  all (one-off emails on booking/confirm). A production version would
  want a proper job queue with backoff.
- No-shows can't be un-marked from the UI (direct DB edit needed).
- Analytics windows (8 weeks for the bar/line charts, 4 weeks for the
  no-show stat) are hardcoded, not user-configurable.
- "Today's route" on Mission Control shows the last-computed order, not a
  live recompute — see the Phase 6 section above for why that's
  deliberate.
- **Multi-user is a placeholder** (records invite intent only) — see the
  Phase 7 section above and `supabase/migrations/0006_team_invites.sql`
  for what a real implementation would need.
- `bookings_this_month` is incremented in the same request that inserts
  the booking, not atomically with it — a rare race between two
  simultaneous bookings against the last open slot on a Free plan could
  let the count go one over. Low-stakes (it's a soft monthly cap, not a
  billing-accuracy number), but worth a Postgres function if it ever
  matters.
- No handler for `invoice.payment_failed` — a failed card rides out
  Stripe's normal subscription lifecycle to `customer.subscription.deleted`
  with no earlier warning email from RouteMeet itself (Stripe does send
  its own dunning emails by default, separately).
- Vercel Cron frequency: confirmed directly against Vercel's current docs
  — **Hobby-plan projects can only run cron jobs once per day**, and
  `reminders` (every 15 minutes) will fail to deploy there. See the
  Phase 8 free-tier section above for the two ways around this.
- The booking-form rate limiter is in-memory only (no Redis) — it resets
  on cold start and doesn't coordinate across serverless instances. It's
  a real speed bump, not a real ceiling; see the Phase 8 section above
  for the production alternative.
- No CAPTCHA/bot-detection on the public booking form — rate limiting
  slows down casual abuse but wouldn't stop a distributed scraper.
- Onboarding can't be re-triggered from the UI once `onboarding_completed`
  is set — an owner who wants to redo it needs a direct DB edit.
