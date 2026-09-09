import "server-only";
import { format } from "date-fns";
import type { Booking, Business } from "@/lib/types";
import type { RouteResult } from "@/lib/routeService";
import { PLANS } from "@/lib/plans";

function twilioMessagesUrl(): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
}

function basicAuthHeader(): string {
  const token = Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
  ).toString("base64");
  return `Basic ${token}`;
}

async function sendTwilioMessage(input: {
  to: string;
  body: string;
  channel: "sms" | "whatsapp";
}): Promise<void> {
  const from =
    input.channel === "whatsapp"
      ? `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`
      : process.env.TWILIO_FROM_NUMBER!;
  const to = input.channel === "whatsapp" ? `whatsapp:${input.to}` : input.to;

  const res = await fetch(twilioMessagesUrl(), {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: to, Body: input.body }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Twilio request failed (${res.status}): ${errBody}`);
  }
}

/**
 * Client SMS reminder ~2 hours before their meeting. Gated by
 * `business.notify_sms` AND the Business plan itself — checking the plan
 * here (not just at the Settings save boundary) matters because a
 * business can downgrade via the Stripe portal without this toggle ever
 * being touched, leaving a stale `notify_sms = true` in the database.
 * Without this check, a downgraded business would keep getting a paid
 * feature for free until they happened to resave their preferences.
 */
export async function sendClientReminderSms(
  booking: Booking,
  business: Business
): Promise<void> {
  if (!PLANS[business.plan].smsWhatsapp) return;
  if (!business.notify_sms || !booking.client_phone) return;

  const when = format(new Date(booking.start_time), "h:mm a");
  const where =
    booking.location_type === "virtual"
      ? booking.meet_link
        ? `Join: ${booking.meet_link}`
        : "This is a virtual meeting."
      : `Address: ${booking.address}`;

  await sendTwilioMessage({
    to: booking.client_phone,
    channel: "sms",
    body: `Reminder: your ${today_or_date(booking)} at ${when} with ${business.name} is coming up. ${where}`,
  });
}

/**
 * Morning WhatsApp summary to the owner. Gated by `business.notify_whatsapp`
 * and requires `business.owner_phone` (collected in Settings) — plus the
 * same plan check as above and for the same reason.
 */
export async function sendOwnerMorningWhatsApp(
  business: Business,
  route: RouteResult
): Promise<void> {
  if (!PLANS[business.plan].smsWhatsapp) return;
  if (!business.notify_whatsapp || !business.owner_phone) return;

  const lines =
    route.stops.length === 0
      ? "No in-person meetings today."
      : route.stops
          .map(
            (s, i) =>
              `${i + 1}. ${format(new Date(s.arrival), "h:mm a")} — ${s.clientName} (${s.address})`
          )
          .join("\n");

  await sendTwilioMessage({
    to: business.owner_phone,
    channel: "whatsapp",
    body: `Good morning! Today's route:\n${lines}`,
  });
}

function today_or_date(booking: Booking): string {
  const now = new Date();
  const start = new Date(booking.start_time);
  const isSameDay =
    now.getFullYear() === start.getFullYear() &&
    now.getMonth() === start.getMonth() &&
    now.getDate() === start.getDate();
  return isSameDay ? "meeting today" : `meeting on ${format(start, "MMM d")}`;
}
