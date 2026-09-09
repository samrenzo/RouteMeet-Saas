"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession } from "@/lib/stripe";

export async function startCheckout(targetPlan: "pro" | "business") {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/pricing`);
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_user_id", user.id)
    .single();

  if (!business) throw new Error("Business not found");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = await createCheckoutSession(business, targetPlan, appUrl);
  redirect(url);
}
