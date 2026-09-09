import "server-only";
import { format } from "date-fns";
import type { Booking, Business } from "@/lib/types";
import type { RouteResult } from "@/lib/routeService";

const RESEND_URL = "https://api.resend.com/emails";

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<void> {
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html,
      reply_to: input.replyTo,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend request failed (${res.status}): ${body}`);
  }
}

function wrapper(bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1c22;">
      ${bodyHtml}
      <p style="margin-top: 32px; font-size: 12px; color: #6b7280;">Sent by RouteMeet</p>
    </div>
  `;
}

function formatWhen(booking: Booking, timezone: string): string {
  // NOTE: formats in the server's local timezone, not `business.timezone`.
  // Same simplification as the dashboard/route UI — see README limitations.
  return format(new Date(booking.start_time), "EEEE, MMMM d 'at' h:mm a");
}

/**
 * Sent immediately when a client submits a booking request (status =
 * "pending"). This is core transactional confirmation, not gated by the
 * owner's notification preferences — the client should always know their
 * request went through.
 */
export async function sendBookingRequestReceivedEmail(
  booking: Booking,
  business: Business
): Promise<void> {
  await sendEmail({
    to: booking.client_email,
    subject: `Request sent to ${business.name}`,
    html: wrapper(`
      <h2>Your request is in</h2>
      <p>You asked to meet with <strong>${business.name}</strong> on
      <strong>${formatWhen(booking, business.timezone)}</strong>
      (${booking.location_type === "virtual" ? "virtual" : booking.address}).</p>
      <p>You'll get another email as soon as it's confirmed.</p>
    `),
  });
}

/**
 * Sent to both parties when the owner confirms a booking. Client email is
 * core transactional (always sent). The owner's copy is a convenience —
 * gated by `business.notify_email` since they'll also see it on their
 * dashboard and (Phase 2) their own Google Calendar.
 */
export async function sendBookingConfirmedEmails(
  booking: Booking,
  business: Business
): Promise<void> {
  const meetLine = booking.meet_link
    ? `<p><a href="${booking.meet_link}">Join the video call</a></p>`
    : "";
  const whereLine =
    booking.location_type === "virtual"
      ? "This is a virtual meeting — a link is below."
      : `Meeting address: <strong>${booking.address}</strong>`;

  await sendEmail({
    to: booking.client_email,
    subject: `Confirmed: ${business.name} on ${format(new Date(booking.start_time), "MMM d")}`,
    html: wrapper(`
      <h2>You're confirmed</h2>
      <p><strong>${formatWhen(booking, business.timezone)}</strong> with ${business.name}.</p>
      <p>${whereLine}</p>
      ${meetLine}
    `),
  });

  if (business.notify_email && business.owner_email) {
    await sendEmail({
      to: business.owner_email,
      subject: `Confirmed: ${booking.client_name} on ${format(new Date(booking.start_time), "MMM d")}`,
      html: wrapper(`
        <h2>Booking confirmed</h2>
        <p><strong>${booking.client_name}</strong> — ${formatWhen(booking, business.timezone)}.</p>
        <p>${whereLine}</p>
        ${meetLine}
      `),
    }).catch((e) => {
      console.error("Failed to send owner confirmation copy:", e);
    });
  }
}

/** Sent to the owner each morning (6:30 AM cron) summarizing today's route. */
export async function sendDailyItineraryEmail(
  business: Business,
  route: RouteResult
): Promise<void> {
  if (!business.notify_email || !business.owner_email) return;

  const stopsHtml =
    route.stops.length === 0
      ? "<p>No in-person meetings today.</p>"
      : `<ol>${route.stops
          .map(
            (s) =>
              `<li><strong>${s.clientName}</strong> — arrive ${format(new Date(s.arrival), "h:mm a")}, ${s.address}</li>`
          )
          .join("")}</ol>`;

  await sendEmail({
    to: business.owner_email,
    subject: `Today's itinerary — ${route.stops.length} stop${route.stops.length === 1 ? "" : "s"}`,
    html: wrapper(`
      <h2>Today's route</h2>
      ${stopsHtml}
    `),
  });
}

/**
 * Sends an owner-authored follow-up email (Phase 5) to a client. The body
 * is plain text (from the editable textarea in the dashboard) — converted
 * to simple HTML with line breaks preserved, and CC'd to the owner via
 * replyTo so client replies land in the owner's own inbox.
 */
export async function sendFollowUpEmail(
  business: Business,
  clientEmail: string,
  subject: string,
  bodyText: string
): Promise<void> {
  const html = bodyText
    .split("\n\n")
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  await sendEmail({
    to: clientEmail,
    subject,
    html: wrapper(html),
    replyTo: business.owner_email || undefined,
  });
}
