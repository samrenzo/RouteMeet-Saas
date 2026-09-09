"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geocode";
import { z } from "zod";

const basicsSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().min(1, "Business name is required"),
  homeBaseAddress: z.string().min(1, "Home base address is required"),
  timezone: z.string().min(1),
});

/** Onboarding step 1 — same fields as Settings' profile form, geocoded immediately. */
export async function saveBusinessBasics(input: {
  businessId: string;
  name: string;
  homeBaseAddress: string;
  timezone: string;
}) {
  const parsed = basicsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const supabase = createClient();
  let homeBaseLat: number | null = null;
  let homeBaseLng: number | null = null;
  try {
    const geocoded = await geocodeAddress(parsed.data.homeBaseAddress);
    if (geocoded) {
      homeBaseLat = geocoded.lat;
      homeBaseLng = geocoded.lng;
    }
  } catch (e) {
    console.error("Geocoding failed during onboarding:", e);
  }

  const { error } = await supabase
    .from("businesses")
    .update({
      name: parsed.data.name,
      home_base_address: parsed.data.homeBaseAddress,
      home_base_lat: homeBaseLat,
      home_base_lng: homeBaseLng,
      timezone: parsed.data.timezone,
    })
    .eq("id", parsed.data.businessId);

  if (error) throw new Error(error.message);
  revalidatePath("/onboarding");
}

/** Onboarding step 3 — marks the flow done so /dashboard stops redirecting here. */
export async function completeOnboarding(businessId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("businesses")
    .update({ onboarding_completed: true })
    .eq("id", businessId);

  if (error) throw new Error(error.message);
}
