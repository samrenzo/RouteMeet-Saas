import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import type { Business } from "@/lib/types";

/**
 * Ensures the signed-in owner has a `businesses` row, creating a
 * reasonable default (name from Google profile, slug derived from it,
 * uniquified if needed) on their very first sign-in. Phase 8's onboarding
 * flow lets them edit these defaults immediately after.
 */
export async function getOrCreateBusinessForUser(params: {
  userId: string;
  email: string;
  fullName: string;
  googleRefreshToken?: string;
}): Promise<Business> {
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_user_id", params.userId)
    .maybeSingle();

  if (existing) {
    // Keep the refresh token current if Google issued a new one.
    if (params.googleRefreshToken) {
      await supabase
        .from("businesses")
        .update({ google_refresh_token: params.googleRefreshToken })
        .eq("id", existing.id);
    }
    return existing as Business;
  }

  const baseName = params.fullName || params.email.split("@")[0] || "my-business";
  const baseSlug = slugify(baseName) || "business";
  const slug = await findAvailableSlug(baseSlug);

  const { data: created, error } = await supabase
    .from("businesses")
    .insert({
      owner_user_id: params.userId,
      name: baseName,
      slug,
      owner_email: params.email,
      google_refresh_token: params.googleRefreshToken ?? null,
    })
    .select("*")
    .single();

  if (error || !created) {
    throw new Error(`Failed to create business: ${error?.message}`);
  }

  // Seed sensible default hours (Mon–Fri, 9am–5pm) so the booking page
  // isn't empty before the owner visits Settings. Fine to reuse the same
  // session-scoped client — the business we just inserted is owned by
  // this same signed-in user, so the "Owners manage their own business
  // hours" RLS policy already permits it.
  await supabase.from("business_hours").insert(
    [1, 2, 3, 4, 5].map((day) => ({
      business_id: created.id,
      day_of_week: day,
      start_time: "09:00",
      end_time: "17:00",
    }))
  );

  return created as Business;
}

/**
 * Checks slug uniqueness across ALL businesses, not just the current
 * user's — which necessarily means reading rows this user doesn't own.
 * Since Phase 8's security pass removed the public SELECT policy on
 * `businesses` (see migration 0008), the regular session-scoped client
 * can no longer see other owners' rows at all, so this must use the
 * service-role client. (The `slug` column also has a DB-level unique
 * constraint as a backstop, but relying on that here would mean a raw
 * Postgres constraint-violation error instead of a graceful suffix.)
 */
async function findAvailableSlug(base: string): Promise<string> {
  const supabase = createServiceRoleClient();
  let candidate = base;
  let suffix = 1;

  while (true) {
    const { data } = await supabase
      .from("businesses")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (!data) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}
