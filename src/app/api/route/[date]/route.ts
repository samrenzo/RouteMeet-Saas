import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeAndPersistRoute } from "@/lib/routeService";
import { PLANS } from "@/lib/plans";

export async function GET(
  request: Request,
  { params }: { params: { date: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    return NextResponse.json(
      { error: "date must be formatted yyyy-MM-dd" },
      { status: 400 }
    );
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("id, plan")
    .eq("owner_user_id", user.id)
    .single();

  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  if (!PLANS[business.plan].routeOptimization) {
    return NextResponse.json(
      { error: "Route optimization requires the Pro or Business plan.", upgradeRequired: true },
      { status: 403 }
    );
  }

  try {
    const route = await computeAndPersistRoute(business.id, params.date);
    return NextResponse.json(route);
  } catch (e) {
    console.error("Route computation failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Route computation failed" },
      { status: 500 }
    );
  }
}
