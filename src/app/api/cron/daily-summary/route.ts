import { NextResponse } from "next/server";
import { format } from "date-fns";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeAndPersistRoute, type RouteResult } from "@/lib/routeService";
import { sendDailyItineraryEmail } from "@/lib/email";
import { sendOwnerMorningWhatsApp } from "@/lib/sms";
import { PLANS } from "@/lib/plans";

/**
 * Runs at 6:30 AM (see vercel.json) — 30 minutes after Phase 3's
 * precompute-routes cron, so the optimized order is already settled by
 * the time these summaries go out. Covers any business with at least one
 * confirmed booking (virtual or in-person) today; route.stops will simply
 * be empty for owners with virtual-only days.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: rows, error } = await supabase
    .from("bookings")
    .select("business_id")
    .eq("status", "confirmed")
    .gte("start_time", `${today}T00:00:00Z`)
    .lte("start_time", `${today}T23:59:59Z`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const businessIds = Array.from(
    new Set((rows ?? []).map((r: { business_id: string }) => r.business_id))
  );

  const results = await Promise.allSettled(
    businessIds.map(async (businessId) => {
      const { data: business } = await supabase
        .from("businesses")
        .select("*")
        .eq("id", businessId)
        .single();
      if (!business) return;

      // Free plan doesn't get route optimization (Phase 7) — send the
      // summary with an empty route rather than calling the paid feature.
      // In practice Free businesses shouldn't have in-person bookings at
      // all (enforced at booking creation), so this is mostly a safety net.
      // Also must pass this cron's service-role client through — see the
      // docstring on computeAndPersistRoute for why the default client
      // would silently fail RLS in a cron context.
      const route: RouteResult = PLANS[business.plan].routeOptimization
        ? await computeAndPersistRoute(businessId, today, { supabaseClient: supabase })
        : { date: today, homeBase: null, stops: [], naiveOrderTotalTravelSeconds: 0, optimizedTotalTravelSeconds: 0 };

      await Promise.allSettled([
        sendDailyItineraryEmail(business, route),
        sendOwnerMorningWhatsApp(business, route),
      ]);
    })
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - succeeded;

  return NextResponse.json({ date: today, businesses: businessIds.length, succeeded, failed });
}
