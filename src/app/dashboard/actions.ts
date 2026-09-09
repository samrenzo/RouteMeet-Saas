"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createCalendarEvent,
  deleteCalendarEvent,
} from "@/lib/googleCalendar";
import { geocodeAddress } from "@/lib/geocode";
import { sendBookingConfirmedEmails } from "@/lib/email";

/**
 * Confirms a pending booking:
 *  - virtual: creates a Calendar event with an auto-generated Meet link
 *  - in_person: creates a plain Calendar event with the address as location
 * Both add the client as an attendee. The Calendar event_id/meet_link are
 * stored on the booking row, then status flips to "confirmed".
 *
 * If the owner hasn't connected Google (no refresh token on file), we
 * still confirm the booking but skip Calendar — better to let the owner
 * see and act on the booking than to hard-fail here.
 */
export async function confirmBooking(bookingId: string) {
  const supabase = createClient();

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();
  if (bookingError || !booking) throw new Error("Booking not found");

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", booking.business_id)
    .single();
  if (businessError || !business) throw new Error("Business not found");

  // Geocode in-person addresses at confirmation time (Phase 3) so the
  // route optimizer always has coordinates to work with. Best-effort: a
  // failed geocode shouldn't block confirming the booking itself — the
  // route builder just skips stops it can't place.
  let lat = booking.lat;
  let lng = booking.lng;
  if (booking.location_type === "in_person" && booking.address && !lat) {
    try {
      const geocoded = await geocodeAddress(booking.address);
      if (geocoded) {
        lat = geocoded.lat;
        lng = geocoded.lng;
      }
    } catch (e) {
      console.error("Geocoding failed during confirm:", e);
    }
  }

  let meetLink: string | null = null;
  let eventId: string | null = null;

  if (business.google_refresh_token) {
    const result = await createCalendarEvent(business.google_refresh_token, {
      summary:
        booking.location_type === "virtual"
          ? `${booking.client_name} <> ${business.name} (video call)`
          : `${booking.client_name} <> ${business.name}`,
      description: booking.notes ?? undefined,
      startIso: booking.start_time,
      endIso: booking.end_time,
      timezone: business.timezone,
      attendeeEmail: booking.client_email,
      locationType: booking.location_type,
      address: booking.address,
    });
    meetLink = result.meetLink;
    eventId = result.eventId;
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      status: "confirmed",
      meet_link: meetLink,
      event_id: eventId,
      lat,
      lng,
    })
    .eq("id", bookingId);

  if (updateError) throw new Error(updateError.message);

  try {
    await sendBookingConfirmedEmails(
      { ...booking, meet_link: meetLink, lat, lng },
      business
    );
  } catch (e) {
    console.error("Failed to send confirmation emails:", e);
  }

  revalidatePath("/dashboard");
}

/**
 * Marks a past confirmed booking as a no-show — feeds the Phase 6
 * "no-show rate" stat on the Mission Control dashboard. Doesn't touch the
 * Calendar event; the meeting was real, it's just that the client didn't
 * show, so the historical record should stay intact.
 */
export async function markNoShow(bookingId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("bookings")
    .update({ status: "no_show" })
    .eq("id", bookingId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

/**
 * Cancels a booking. If a Calendar event was created for it, deletes that
 * event first (best-effort — a Calendar failure shouldn't block the owner
 * from cancelling in RouteMeet).
 */
export async function cancelBooking(bookingId: string) {
  const supabase = createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, event_id, business_id")
    .eq("id", bookingId)
    .single();

  if (booking?.event_id) {
    const { data: business } = await supabase
      .from("businesses")
      .select("google_refresh_token")
      .eq("id", booking.business_id)
      .single();

    if (business?.google_refresh_token) {
      try {
        await deleteCalendarEvent(business.google_refresh_token, booking.event_id);
      } catch (e) {
        // Log and continue — don't let a Calendar API hiccup trap the
        // owner in a state where they can't cancel in RouteMeet.
        console.error("Failed to delete Calendar event on cancel:", e);
      }
    }
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}
