import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Every booking always has a client_email (required at booking time), so
 * that's the dedupe key — matches the unique index on
 * clients(business_id, email). Phone/name are kept in sync with the most
 * recent booking so repeat clients don't end up with a stale name.
 *
 * Uses the SERVICE ROLE client deliberately: this runs from the public,
 * unauthenticated booking flow, and the `clients` table has no RLS policy
 * granting the anon role any access at all (by design — client records
 * are otherwise strictly owner-scoped). Using the regular cookie-based
 * client here would silently fail every insert/update for real anonymous
 * visitors, which is exactly what happened until this was caught in
 * review — the public booking form would have thrown on every submission.
 *
 * Returns the client_id to attach to the new booking row.
 */
export async function upsertClientForBooking(
  businessId: string,
  input: { name: string; email: string; phone?: string | null }
): Promise<string> {
  const supabase = createServiceRoleClient();

  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .eq("business_id", businessId)
    .eq("email", input.email)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("clients")
      .update({ name: input.name, phone: input.phone ?? null })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("clients")
    .insert({
      business_id: businessId,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`Failed to create client: ${error?.message}`);
  }

  return created.id;
}
