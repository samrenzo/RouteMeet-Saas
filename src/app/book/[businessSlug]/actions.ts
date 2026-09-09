"use server";

import { z } from "zod";
import { randomUUID } from "crypto";
import { addDays } from "date-fns";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { computeAvailableSlots, DAYS_AHEAD } from "@/lib/slots";
import { getFreeBusy } from "@/lib/googleCalendar";
import { sendBookingRequestReceivedEmail } from "@/lib/email";
import { notifyOwnerNewBooking } from "@/lib/push";
import { upsertClientForBooking } from "@/lib/clients";
import { PLANS, hasReachedBookingLimit } from "@/lib/plans";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import type { Booking } from "@/lib/types";

const createBookingSchema = z.object({
  businessSlug: z.string().min(1),
  startTimeIso: z.string().min(1),
  clientName: z.string().min(1, "Name is required"),
  clientEmail: z.string().email("Enter a valid email"),
  clientPhone: z.string().optional(),
  locationType: z.enum(["virtual", "in_person"]),
  address: z.string().optional(),
});

// Public, unauthenticated, and the single most abuse-prone endpoint in the
// app (spam bookings, scraping slot availability by brute-forcing
// submissions, etc.) — see src/lib/rateLimit.ts for what this does and
// doesn't protect against.
const BOOKING_RATE_LIMIT = 5;
const BOOKING_RATE_WINDOW_MS = 60_000;

export async function createBooking(formData: FormData) {
  const ip = getClientIp(headers());
  const rateLimit = checkRateLimit(`booking:${ip}`, BOOKING_RATE_LIMIT, BOOKING_RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    throw new Error(
      `Too many booking attempts — please try again in about ${rateLimit.retryAfterSeconds}s.`
    );
  }

  const parsed = createBookingSchema.safeParse({
    businessSlug: formData.get("businessSlug"),
    startTimeIso: formData.get("startTimeIso"),
    clientName: formData.get("clientName"),
    clientEmail: formData.get("clientEmail"),
    clientPhone: formData.get("clientPhone") || undefined,
    locationType: formData.get("locationType"),
    address: formData.get("address") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid booking request");
  }

  const data = parsed.data;

  if (data.locationType === "in_person" && !data.address) {
    throw new Error("Address is required for in-person meetings");
  }

  // SERVICE ROLE for every read/write below except the final bookings
  // INSERT. This visitor is anonymous by definition, and `businesses`,
  // `business_hours` (fine either way, it's non-sensitive), and
  // especially `bookings` (existing rows, for slot validation) have no
  // RLS grant letting the anon role read them. Using the regular
  // cookie-based client here silently returns empty results instead of
  // erroring — which would have meant double-booking prevention quietly
  // did nothing for every real visitor. See book/[businessSlug]/page.tsx
  // for the fuller explanation and the migration that tightened
  // `businesses`' public policy after this was caught in review.
  const supabaseAdmin = createServiceRoleClient();

  const { data: business, error: businessError } = await supabaseAdmin
    .from("businesses")
    .select("*")
    .eq("slug", data.businessSlug)
    .single();

  if (businessError || !business) {
    throw new Error("This booking page could not be found.");
  }

  const plan = PLANS[business.plan];

  // Defense in depth — the booking page already hides the in-person
  // toggle and shows a limit-reached message for Free-tier businesses,
  // but a stale page or a hand-crafted request shouldn't be able to
  // bypass either restriction.
  if (data.locationType === "in_person" && plan.virtualOnly) {
    throw new Error(
      "This business's plan only supports virtual meetings right now."
    );
  }
  if (hasReachedBookingLimit(business.plan, business.bookings_this_month)) {
    throw new Error(
      "This business has reached their booking limit for this month."
    );
  }

  // Re-validate the slot is still open server-side (defends against two
  // clients racing on the same slot, or a stale page) — including against
  // the owner's real Google Calendar, not just other RouteMeet bookings.
  const [{ data: businessHours }, { data: existingBookings }] = await Promise.all([
    supabaseAdmin.from("business_hours").select("*").eq("business_id", business.id),
    supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("business_id", business.id)
      .in("status", ["pending", "confirmed"]),
  ]);

  let externalBusy: { start: Date; end: Date }[] = [];
  if (business.google_refresh_token) {
    try {
      const now = new Date();
      externalBusy = await getFreeBusy(
        business.google_refresh_token,
        now.toISOString(),
        addDays(now, DAYS_AHEAD).toISOString()
      );
    } catch (e) {
      console.error("freebusy lookup failed during booking creation:", e);
    }
  }

  const startTime = new Date(data.startTimeIso);
  const availableSlots = computeAvailableSlots(
    businessHours ?? [],
    existingBookings ?? [],
    new Date(),
    externalBusy
  );
  const stillOpen = availableSlots.some(
    (slot) => slot.start.getTime() === startTime.getTime()
  );

  if (!stillOpen) {
    throw new Error(
      "Sorry, that slot was just taken. Please choose another time."
    );
  }

  const slotDurationMs = 30 * 60 * 1000;
  const endTime = new Date(startTime.getTime() + slotDurationMs);

  const clientId = await upsertClientForBooking(business.id, {
    name: data.clientName,
    email: data.clientEmail,
    phone: data.clientPhone,
  });

  // The actual booking row is inserted through the regular cookie-based
  // (anon) client on purpose — this is the one write in this whole action
  // that SHOULD go through the narrow public policy
  // (`with check (status = 'pending')`) as the real enforcement boundary,
  // not just server-side validation above.
  //
  // Deliberately NOT chaining `.select()` here: Supabase/PostgREST
  // performs an implicit SELECT to return the inserted row whenever
  // `.select()` is used, and that SELECT is itself subject to RLS —
  // `bookings` has no public SELECT policy (by design, so anonymous
  // visitors can't browse other clients' bookings), so `.select()` would
  // make this call fail even though the insert itself succeeded. Instead,
  // generate the id ourselves and build the object we need locally.
  const bookingId = randomUUID();
  const nowIso = new Date().toISOString();

  const supabasePublic = createClient();
  const { error: insertError } = await supabasePublic.from("bookings").insert({
    id: bookingId,
    business_id: business.id,
    client_id: clientId,
    client_name: data.clientName,
    client_email: data.clientEmail,
    client_phone: data.clientPhone ?? null,
    location_type: data.locationType,
    address: data.locationType === "in_person" ? data.address! : null,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    status: "pending",
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  const booking: Booking = {
    id: bookingId,
    business_id: business.id,
    client_id: clientId,
    client_name: data.clientName,
    client_email: data.clientEmail,
    client_phone: data.clientPhone ?? null,
    location_type: data.locationType,
    address: data.locationType === "in_person" ? data.address! : null,
    lat: null,
    lng: null,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    status: "pending",
    meet_link: null,
    event_id: null,
    reminder_sent: false,
    push_reminder_sent: false,
    notes: null,
    created_at: nowIso,
  };

  // Increments the counter the Free-tier limit check reads above. Not
  // atomic with the insert (a rare race could let a business squeak past
  // the limit by one), but the read-check-then-write dance already isn't
  // airtight against concurrent submissions either — acceptable at this
  // scale. A stricter version would use a Postgres function to check +
  // increment atomically. Uses service role — there's no public UPDATE
  // policy on `businesses` (correctly so), so this needs elevated access
  // same as the reads above.
  await supabaseAdmin
    .from("businesses")
    .update({ bookings_this_month: business.bookings_this_month + 1 })
    .eq("id", business.id);

  // Notifications are awaited (not fire-and-forget) because serverless
  // functions can be frozen/terminated right after the response is sent —
  // an un-awaited promise here might never actually complete. Errors are
  // caught individually so a Resend/OneSignal hiccup still lets the client
  // reach their confirmation screen.
  try {
    await sendBookingRequestReceivedEmail(booking, business);
  } catch (e) {
    console.error("Failed to send booking-received email:", e);
  }
  try {
    await notifyOwnerNewBooking(business, booking);
  } catch (e) {
    console.error("Failed to send new-booking push:", e);
  }

  redirect(`/book/${data.businessSlug}/confirmed?bookingId=${booking.id}`);
}
