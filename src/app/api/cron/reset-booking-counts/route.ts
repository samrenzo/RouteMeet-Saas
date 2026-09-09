import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Runs at midnight on the 1st of each month (see vercel.json). Resets
 * every business's `bookings_this_month` counter to 0 — the Free-tier
 * limit check in book/[businessSlug]/actions.ts reads this column rather
 * than counting rows dynamically, per the spec, so it needs an explicit
 * reset rather than "just" rolling off with time.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { error, count } = await supabase
    .from("businesses")
    .update({ bookings_this_month: 0 })
    .neq("bookings_this_month", 0) // skip already-zero rows, cheaper write
    .select("id", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reset: count ?? 0 });
}
