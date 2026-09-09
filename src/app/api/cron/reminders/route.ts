import { NextResponse } from "next/server";
import { addMinutes } from "date-fns";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendClientReminderSms } from "@/lib/sms";
import { notifyOwnerMeetingReminder } from "@/lib/push";
import type { Booking, Business } from "@/lib/types";

/**
 * Runs every 15 minutes (see vercel.json). Two independent jobs share one
 * endpoint since they're both short, cheap queries:
 *
 *  1. Client SMS reminder ~2 hours before start_time (window: 105-135 min
 *     out, wide enough that a 15-minute cron cadence can't skip a booking).
 *  2. Owner push reminder ~15 minutes before start_time (window: 10-20 min
 *     out, same reasoning).
 *
 * Each booking is only ever processed once per reminder type — guarded by
 * `reminder_sent` / `push_reminder_sent` respectively, set immediately
 * after a successful send.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = new Date();

  const smsResult = await runSmsReminders(supabase, now);
  const pushResult = await runPushReminders(supabase, now);

  return NextResponse.json({ sms: smsResult, push: pushResult });
}

async function runSmsReminders(
  supabase: ReturnType<typeof createServiceRoleClient>,
  now: Date
) {
  const windowStart = addMinutes(now, 105).toISOString();
  const windowEnd = addMinutes(now, 135).toISOString();

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("*, businesses(*)")
    .eq("status", "confirmed")
    .eq("reminder_sent", false)
    .gte("start_time", windowStart)
    .lte("start_time", windowEnd);

  if (error) return { sent: 0, error: error.message };

  let sent = 0;
  for (const row of bookings ?? []) {
    const booking = row as Booking & { businesses: Business };
    const business = booking.businesses;
    if (!business) continue;

    try {
      await sendClientReminderSms(booking, business);
      await supabase
        .from("bookings")
        .update({ reminder_sent: true })
        .eq("id", booking.id);
      sent++;
    } catch (e) {
      console.error(`SMS reminder failed for booking ${booking.id}:`, e);
    }
  }

  return { sent };
}

async function runPushReminders(
  supabase: ReturnType<typeof createServiceRoleClient>,
  now: Date
) {
  const windowStart = addMinutes(now, 10).toISOString();
  const windowEnd = addMinutes(now, 20).toISOString();

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("*, businesses(*)")
    .eq("status", "confirmed")
    .eq("push_reminder_sent", false)
    .gte("start_time", windowStart)
    .lte("start_time", windowEnd);

  if (error) return { sent: 0, error: error.message };

  let sent = 0;
  for (const row of bookings ?? []) {
    const booking = row as Booking & { businesses: Business };
    const business = booking.businesses;
    if (!business) continue;

    try {
      await notifyOwnerMeetingReminder(business, booking);
      await supabase
        .from("bookings")
        .update({ push_reminder_sent: true })
        .eq("id", booking.id);
      sent++;
    } catch (e) {
      console.error(`Push reminder failed for booking ${booking.id}:`, e);
    }
  }

  return { sent };
}
