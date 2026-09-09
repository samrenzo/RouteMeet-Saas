import { notFound } from "next/navigation";
import { addDays } from "date-fns";
import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeAvailableSlots, DAYS_AHEAD } from "@/lib/slots";
import { getFreeBusy } from "@/lib/googleCalendar";
import { PLANS, hasReachedBookingLimit } from "@/lib/plans";
import { BookingFlow, type SerializedSlot } from "@/components/booking/booking-flow";
import { Card } from "@/components/ui/card";

// This whole page uses the SERVICE ROLE client, not the regular
// cookie-based one — deliberately. Visitors here are anonymous by
// definition, and `businesses`/`bookings` have no RLS policy granting the
// anon role the reads this page needs (existing bookings, to correctly
// exclude already-taken slots; the business's plan and refresh token, to
// gate features and check calendar freebusy). The old broad "anyone can
// read businesses" policy that used to paper over this was itself a
// bigger problem — it exposed google_refresh_token, stripe ids, and the
// owner's phone/email to anyone with the public anon key, not just this
// page. See supabase/migrations/0008_security_fixes.sql. The actual
// booking INSERT in actions.ts still goes through the regular
// cookie-based client so the narrow "status must be pending" public
// policy remains the real boundary for writes.

export async function generateMetadata({
  params,
}: {
  params: { businessSlug: string };
}): Promise<Metadata> {
  const supabase = createServiceRoleClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("slug", params.businessSlug)
    .maybeSingle();

  const title = business ? `Book a meeting with ${business.name}` : "Book a meeting";
  const description = business
    ? `Schedule a virtual or in-person meeting with ${business.name} in a few clicks.`
    : "Schedule a meeting.";

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
  };
}

export default async function BookingPage({
  params,
}: {
  params: { businessSlug: string };
}) {
  const supabase = createServiceRoleClient();

  // Need google_refresh_token too (Phase 2) to also block times that are
  // busy on the owner's real Google Calendar, not just RouteMeet bookings.
  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, slug, google_refresh_token, plan, bookings_this_month")
    .eq("slug", params.businessSlug)
    .maybeSingle();

  if (!business) notFound();

  const plan = PLANS[business.plan];
  const limitReached = hasReachedBookingLimit(business.plan, business.bookings_this_month);

  if (limitReached) {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <Card className="p-8 text-center">
          <p className="font-medium">Booking temporarily unavailable</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {business.name} has reached their booking limit for this month.
            Please check back soon.
          </p>
        </Card>
      </main>
    );
  }

  const [{ data: businessHours }, { data: existingBookings }] = await Promise.all([
    supabase.from("business_hours").select("*").eq("business_id", business.id),
    supabase
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
      // Don't let a Calendar API hiccup take the whole booking page down —
      // fall back to RouteMeet-only availability for this render.
      console.error("freebusy lookup failed:", e);
    }
  }

  const slots = computeAvailableSlots(
    businessHours ?? [],
    existingBookings ?? [],
    new Date(),
    externalBusy
  );
  const serializedSlots: SerializedSlot[] = slots.map((s) => ({
    startIso: s.start.toISOString(),
    endIso: s.end.toISOString(),
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">Book a meeting with</p>
        <h1 className="text-2xl font-semibold tracking-tight">{business.name}</h1>
      </div>
      <BookingFlow
        businessSlug={business.slug}
        slots={serializedSlots}
        allowInPerson={!plan.virtualOnly}
      />
    </main>
  );
}
