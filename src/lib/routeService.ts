import "server-only";
import { zonedTimeToUtc } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geocode";
import { buildTravelTimeMatrix, type GeoPoint } from "@/lib/distanceMatrix";
import { optimizeRoute } from "@/lib/routeOptimizer";
import { patchCalendarEventTime } from "@/lib/googleCalendar";
import type { Booking, Business, Database } from "@/lib/types";

type SupabaseAny = SupabaseClient<Database>;

export const DEFAULT_BUFFER_MINUTES = 15;

export interface RouteStop {
  bookingId: string;
  order: number; // 1-based position in the day's route
  clientName: string;
  address: string;
  lat: number;
  lng: number;
  arrival: string; // ISO
  departure: string; // ISO
  travelSecondsFromPrevious: number;
}

export interface RouteResult {
  date: string;
  homeBase: GeoPoint | null;
  stops: RouteStop[];
  naiveOrderTotalTravelSeconds: number;
  optimizedTotalTravelSeconds: number;
}

/**
 * Computes (and persists) the optimized route for one business on one
 * calendar date (business's own timezone). Called from:
 *  - GET /api/route/[date] (owner viewing "Today's Route") — no
 *    `supabaseClient` passed, so this defaults to the cookie-based client
 *    acting as the signed-in owner, which is exactly right there since
 *    every table this touches has an "owner_user_id = auth.uid()" RLS
 *    policy.
 *  - The 6am/6:30am Vercel Cron jobs — these run with NO user session at
 *    all, so they MUST pass their own `createServiceRoleClient()` instance
 *    as `supabaseClient`, or every read/write below silently fails RLS
 *    (the anon role has no policy granting it access to another user's
 *    businesses/bookings/business_hours/route_stats). This bit us once
 *    already during review — the crons were quietly non-functional until
 *    this parameter was added, so don't drop it from a call site.
 */
export async function computeAndPersistRoute(
  businessId: string,
  dateStr: string, // "yyyy-MM-dd"
  options: { bufferMinutes?: number; supabaseClient?: SupabaseAny } = {}
): Promise<RouteResult> {
  const bufferMinutes = options.bufferMinutes ?? DEFAULT_BUFFER_MINUTES;
  const supabase = options.supabaseClient ?? createClient();

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .single();
  if (businessError || !business) throw new Error("Business not found");

  const dayStart = zonedTimeToUtc(`${dateStr}T00:00:00`, business.timezone);
  const dayEnd = zonedTimeToUtc(`${dateStr}T23:59:59`, business.timezone);

  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("*")
    .eq("business_id", businessId)
    .eq("location_type", "in_person")
    .eq("status", "confirmed")
    .gte("start_time", dayStart.toISOString())
    .lte("start_time", dayEnd.toISOString())
    .order("start_time", { ascending: true });
  if (bookingsError) throw new Error(bookingsError.message);

  const stopsSource = bookings ?? [];

  if (!business.home_base_lat || !business.home_base_lng) {
    throw new Error(
      "Set a home base address in Settings before computing a route."
    );
  }
  const homeBase: GeoPoint = {
    lat: business.home_base_lat,
    lng: business.home_base_lng,
  };

  if (stopsSource.length === 0) {
    return {
      date: dateStr,
      homeBase,
      stops: [],
      naiveOrderTotalTravelSeconds: 0,
      optimizedTotalTravelSeconds: 0,
    };
  }

  // Fill in any missing coordinates defensively (should be rare — Phase 2's
  // confirmBooking geocodes at confirmation time).
  const geocoded = await ensureCoordinates(supabase, stopsSource);

  const points: GeoPoint[] = [homeBase, ...geocoded.map((b) => ({ lat: b.lat!, lng: b.lng! }))];
  const matrix = await buildTravelTimeMatrix(points);

  const naiveOrder = geocoded.map((_, i) => i + 1); // as originally booked
  const optimizedOrder =
    geocoded.length >= 2 ? optimizeRoute(matrix) : naiveOrder;

  const departureAnchor = await resolveDayStartTime(
    supabase,
    business,
    dateStr,
    geocoded
  );

  const stops = buildSchedule(
    optimizedOrder,
    geocoded,
    matrix,
    departureAnchor,
    bufferMinutes
  );

  await persistSchedule(supabase, business, stops);

  const naiveOrderTotalTravelSeconds = sumConsecutive(matrix, [0, ...naiveOrder]);
  const optimizedTotalTravelSeconds = sumConsecutive(matrix, [0, ...optimizedOrder]);

  // Logged for Phase 6 analytics ("average travel time saved", the
  // travel-time-saved-per-week chart). Upserted so recomputing the same
  // day (e.g. a manual "Recompute" click) overwrites rather than
  // double-counts that day's stats.
  await supabase.from("route_stats").upsert(
    {
      business_id: businessId,
      route_date: dateStr,
      naive_seconds: naiveOrderTotalTravelSeconds,
      optimized_seconds: optimizedTotalTravelSeconds,
      stop_count: stops.length,
    },
    { onConflict: "business_id,route_date" }
  );

  return {
    date: dateStr,
    homeBase,
    stops,
    naiveOrderTotalTravelSeconds,
    optimizedTotalTravelSeconds,
  };
}

async function ensureCoordinates(
  supabase: SupabaseAny,
  bookings: Booking[]
): Promise<(Booking & { lat: number; lng: number })[]> {
  const result: (Booking & { lat: number; lng: number })[] = [];

  for (const booking of bookings) {
    if (booking.lat && booking.lng) {
      result.push(booking as Booking & { lat: number; lng: number });
      continue;
    }
    if (!booking.address) continue; // can't place it — skip from the route

    const geo = await geocodeAddress(booking.address);
    if (!geo) continue;

    await supabase
      .from("bookings")
      .update({ lat: geo.lat, lng: geo.lng })
      .eq("id", booking.id);

    result.push({ ...booking, lat: geo.lat, lng: geo.lng });
  }

  return result;
}

/**
 * The day's route "departs home" at the owner's normal opening time for
 * that weekday (from business_hours), falling back to the earliest
 * originally-booked start time if no hours are configured for that day.
 */
async function resolveDayStartTime(
  supabase: SupabaseAny,
  business: Business,
  dateStr: string,
  bookings: Booking[]
): Promise<Date> {
  const dayOfWeek = zonedTimeToUtc(`${dateStr}T12:00:00`, business.timezone).getUTCDay();

  const { data: hours } = await supabase
    .from("business_hours")
    .select("*")
    .eq("business_id", business.id)
    .eq("day_of_week", dayOfWeek)
    .maybeSingle();

  if (hours) {
    return zonedTimeToUtc(`${dateStr}T${hours.start_time}`, business.timezone);
  }

  const earliest = bookings.reduce(
    (min, b) => (new Date(b.start_time) < min ? new Date(b.start_time) : min),
    new Date(bookings[0].start_time)
  );
  return earliest;
}

function buildSchedule(
  order: number[], // indices into `bookings`, 1-based (matrix index)
  bookings: (Booking & { lat: number; lng: number })[],
  matrix: number[][],
  departureAnchor: Date,
  bufferMinutes: number
): RouteStop[] {
  const bufferMs = bufferMinutes * 60 * 1000;
  const stops: RouteStop[] = [];

  let currentTime = departureAnchor;
  let currentMatrixIndex = 0; // home base

  order.forEach((matrixIndex, position) => {
    const booking = bookings[matrixIndex - 1];
    const travelSeconds = matrix[currentMatrixIndex][matrixIndex];
    const travelMs = travelSeconds === Infinity ? 0 : travelSeconds * 1000;

    const arrival = new Date(currentTime.getTime() + travelMs + bufferMs);
    const durationMs =
      new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime();
    const departure = new Date(arrival.getTime() + durationMs);

    stops.push({
      bookingId: booking.id,
      order: position + 1,
      clientName: booking.client_name,
      address: booking.address ?? "",
      lat: booking.lat,
      lng: booking.lng,
      arrival: arrival.toISOString(),
      departure: departure.toISOString(),
      travelSecondsFromPrevious: travelSeconds === Infinity ? -1 : travelSeconds,
    });

    currentTime = departure;
    currentMatrixIndex = matrixIndex;
  });

  return stops;
}

async function persistSchedule(
  supabase: SupabaseAny,
  business: Business,
  stops: RouteStop[]
) {
  for (const stop of stops) {
    const { error } = await supabase
      .from("bookings")
      .update({ start_time: stop.arrival, end_time: stop.departure })
      .eq("id", stop.bookingId);
    if (error) {
      console.error(`Failed to persist new time for booking ${stop.bookingId}:`, error);
      continue;
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("event_id")
      .eq("id", stop.bookingId)
      .single();

    if (booking?.event_id && business.google_refresh_token) {
      try {
        await patchCalendarEventTime(
          business.google_refresh_token,
          booking.event_id,
          stop.arrival,
          stop.departure,
          business.timezone
        );
      } catch (e) {
        console.error(
          `Failed to patch Calendar event for booking ${stop.bookingId}:`,
          e
        );
      }
    }
  }
}

function sumConsecutive(matrix: number[][], path: number[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const t = matrix[path[i]][path[i + 1]];
    if (t !== Infinity) total += t;
  }
  return total;
}
