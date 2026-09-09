"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geocode";
import { z } from "zod";

const profileSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().min(1, "Business name is required"),
  homeBaseAddress: z.string().min(1, "Home base address is required"),
  timezone: z.string().min(1),
});

export async function updateBusinessProfile(formData: FormData) {
  const parsed = profileSchema.safeParse({
    businessId: formData.get("businessId"),
    name: formData.get("name"),
    homeBaseAddress: formData.get("homeBaseAddress"),
    timezone: formData.get("timezone"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const supabase = createClient();
  const { businessId, ...fields } = parsed.data;

  // Geocode the home base address here (Phase 3) so the route optimizer
  // always has coordinates without waiting on a separate step. If
  // geocoding fails (bad API key, quota, address not found), keep whatever
  // coordinates were already on file rather than nulling them out.
  const { data: existing } = await supabase
    .from("businesses")
    .select("home_base_lat, home_base_lng, home_base_address")
    .eq("id", businessId)
    .single();

  let homeBaseLat = existing?.home_base_lat ?? null;
  let homeBaseLng = existing?.home_base_lng ?? null;

  if (fields.homeBaseAddress !== existing?.home_base_address) {
    try {
      const geocoded = await geocodeAddress(fields.homeBaseAddress);
      if (geocoded) {
        homeBaseLat = geocoded.lat;
        homeBaseLng = geocoded.lng;
      }
    } catch (e) {
      console.error("Geocoding home base address failed:", e);
    }
  }

  const { error } = await supabase
    .from("businesses")
    .update({
      name: fields.name,
      home_base_address: fields.homeBaseAddress,
      home_base_lat: homeBaseLat,
      home_base_lng: homeBaseLng,
      timezone: fields.timezone,
    })
    .eq("id", businessId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/settings");
}

const hoursRowSchema = z.object({
  day_of_week: z.number().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
});

const hoursSchema = z.object({
  businessId: z.string().uuid(),
  rows: z.array(hoursRowSchema),
});
export async function updateBusinessHours(input: {
  businessId: string;
  rows: { day_of_week: number; start_time: string; end_time: string }[];
}) {
  const parsed = hoursSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid hours");
  }

  const supabase = createClient();
  const { businessId, rows } = parsed.data;

  for (const row of rows) {
    if (row.end_time <= row.start_time) {
      throw new Error("Each day's end time must be after its start time.");
    }
  }

  // Simplest correct approach for a small (≤7 row) table: replace wholesale.
  const { error: deleteError } = await supabase
    .from("business_hours")
    .delete()
    .eq("business_id", businessId);
  if (deleteError) throw new Error(deleteError.message);

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("business_hours").insert(
      rows.map((row) => ({ business_id: businessId, ...row }))
    );
    if (insertError) throw new Error(insertError.message);
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
}

const notificationPrefsSchema = z.object({
  businessId: z.string().uuid(),
  notifyEmail: z.boolean(),
  notifySms: z.boolean(),
  notifyWhatsapp: z.boolean(),
  notifyPush: z.boolean(),
  ownerPhone: z.string().optional(),
});

export async function updateNotificationPreferences(input: {
  businessId: string;
  notifyEmail: boolean;
  notifySms: boolean;
  notifyWhatsapp: boolean;
  notifyPush: boolean;
  ownerPhone: string;
}) {
  const parsed = notificationPrefsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid preferences");
  }
  const { businessId, notifyEmail, notifySms, notifyWhatsapp, notifyPush, ownerPhone } =
    parsed.data;

  if ((notifySms || notifyWhatsapp) && !ownerPhone) {
    throw new Error(
      "Add a phone number before enabling SMS or WhatsApp notifications."
    );
  }

  const supabase = createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("plan")
    .eq("id", businessId)
    .single();

  // Server-side enforcement of the Business-plan gate — the UI already
  // disables these toggles for non-Business plans, but that's a courtesy,
  // not the actual boundary.
  if ((notifySms || notifyWhatsapp) && business?.plan !== "business") {
    throw new Error("SMS and WhatsApp notifications require the Business plan.");
  }

  const { error } = await supabase
    .from("businesses")
    .update({
      notify_email: notifyEmail,
      notify_sms: notifySms,
      notify_whatsapp: notifyWhatsapp,
      notify_push: notifyPush,
      owner_phone: ownerPhone || null,
    })
    .eq("id", businessId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/settings");
}

const teamInviteSchema = z.object({
  businessId: z.string().uuid(),
  email: z.string().email("Enter a valid email"),
});

/**
 * Records invite intent only — see the migration's comment
 * (0006_team_invites.sql) for why this doesn't grant actual login access.
 * Gated to the Business plan both here and in the UI.
 */
export async function inviteTeamMember(input: { businessId: string; email: string }) {
  const parsed = teamInviteSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid email");
  }

  const supabase = createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("plan")
    .eq("id", parsed.data.businessId)
    .single();

  if (business?.plan !== "business") {
    throw new Error("Multi-user support requires the Business plan.");
  }

  const { error } = await supabase.from("team_invites").insert({
    business_id: parsed.data.businessId,
    email: parsed.data.email,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/settings");
}
