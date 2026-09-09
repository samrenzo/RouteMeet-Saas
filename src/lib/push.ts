import "server-only";
import type { Booking, Business } from "@/lib/types";

const ONESIGNAL_URL = "https://api.onesignal.com/notifications";

/**
 * Sends a push notification to a single owner, targeted by external_id.
 * The dashboard registers each owner's browser against OneSignal using
 * their Supabase user id as the external_id (see
 * components/dashboard/push-registration.tsx), so no separate player-id
 * bookkeeping is needed on our side.
 */
async function sendPushToOwner(input: {
  externalUserId: string;
  title: string;
  message: string;
  url?: string;
}): Promise<void> {
  const res = await fetch(ONESIGNAL_URL, {
    method: "POST",
    headers: {
      // NOTE: OneSignal's REST API key uses the "Key " prefix, not
      // "Bearer " or "Basic " — easy to get wrong since most other
      // integrations in this app use Bearer.
      Authorization: `Key ${process.env.ONESIGNAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: process.env.ONESIGNAL_APP_ID,
      include_aliases: { external_id: [input.externalUserId] },
      target_channel: "push",
      headings: { en: input.title },
      contents: { en: input.message },
      url: input.url,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OneSignal request failed (${res.status}): ${errBody}`);
  }
}

/** Instant push when a client submits a new booking request. */
export async function notifyOwnerNewBooking(
  business: Business,
  booking: Booking
): Promise<void> {
  if (!business.notify_push) return;

  await sendPushToOwner({
    externalUserId: business.owner_user_id,
    title: "New booking request",
    message: `${booking.client_name} requested a time — confirm it in your dashboard.`,
    url: "/dashboard",
  });
}

/** Push reminder ~15 minutes before a confirmed meeting. */
export async function notifyOwnerMeetingReminder(
  business: Business,
  booking: Booking
): Promise<void> {
  if (!business.notify_push) return;

  await sendPushToOwner({
    externalUserId: business.owner_user_id,
    title: "Meeting starting soon",
    message: `${booking.client_name} in about 15 minutes.`,
    url: booking.location_type === "virtual" ? "/dashboard" : "/dashboard/route",
  });
}
