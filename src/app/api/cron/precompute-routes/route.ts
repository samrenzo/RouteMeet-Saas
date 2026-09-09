import { NextResponse } from "next/server";
import { format } from "date-fns";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeAndPersistRoute } from "@/lib/routeService";
import { PLANS } from "@/lib/plans";

/**
 * Triggered by Vercel Cron at 6:00 AM UTC (see vercel.json). Vercel signs
 * cron requests with an Authorization header matching CRON_SECRET — verify
 * it so this endpoint can't be hit by anyone else to churn through your
 * Google Maps quota.
 *
 * NOTE: "today" is computed in UTC here for simplicity. Businesses whose
 * timezone is far from UTC may want this run closer to their own local
 * 6 AM — consider multiple cron entries per timezone bucket if that
 * matters at scale.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: businessIds, error } = await supabase
    .from("bookings")
    .select("business_id")
    .eq("location_type", "in_person")
    .eq("status", "confirmed")
    .gte("start_time", `${today}T00:00:00Z`)
    .lte("start_time", `${today}T23:59:59Z`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const uniqueBusinessIds = Array.from(
    new Set((businessIds ?? []).map((b: { business_id: string }) => b.business_id))
  );

  // Route optimization is a Pro/Business feature (Phase 7) — skip Free
  // businesses even if they somehow have a confirmed in-person booking
  // (e.g. downgraded after booking it).
  const { data: eligibleBusinesses } = await supabase
    .from("businesses")
    .select("id, plan")
    .in("id", uniqueBusinessIds);
  const gatedBusinessIds = (eligibleBusinesses ?? [])
    .filter((b: { plan: keyof typeof PLANS }) => PLANS[b.plan].routeOptimization)
    .map((b: { id: string }) => b.id);

  const results = await Promise.allSettled(
    gatedBusinessIds.map((businessId) =>
      // Must pass this cron's service-role client through explicitly —
      // computeAndPersistRoute defaults to the cookie-based client, which
      // has no session at all here and would fail RLS on every table it
      // touches. See the docstring on computeAndPersistRoute.
      computeAndPersistRoute(businessId, today, { supabaseClient: supabase })
    )
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .map((r, i) => ({ r, businessId: gatedBusinessIds[i] }))
    .filter(({ r }) => r.status === "rejected")
    .map(({ r, businessId }) => ({
      businessId,
      error: (r as PromiseRejectedResult).reason?.message,
    }));

  return NextResponse.json({ date: today, succeeded, failed });
}
