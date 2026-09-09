import "server-only";
import {
  startOfWeek,
  endOfWeek,
  subWeeks,
  format,
  startOfDay,
} from "date-fns";
import { createClient } from "@/lib/supabase/server";

export interface QuickStats {
  meetingsThisWeek: number;
  noShowRate: number | null; // null when there's no data yet
  avgTravelTimeSavedMinutes: number | null;
}

/** Powers the three Mission Control stat cards. */
export async function getQuickStats(businessId: string): Promise<QuickStats> {
  const supabase = createClient();
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);

  const { count: meetingsThisWeek } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .neq("status", "cancelled")
    .neq("status", "pending")
    .gte("start_time", weekStart.toISOString())
    .lte("start_time", weekEnd.toISOString());

  // No-show rate over the last 30 days of *past* meetings (confirmed +
  // completed + no_show — i.e. meetings that were actually scheduled to
  // happen, excluding ones still pending or cancelled beforehand).
  const thirtyDaysAgo = subWeeks(now, 4);
  const { data: pastMeetings } = await supabase
    .from("bookings")
    .select("status")
    .eq("business_id", businessId)
    .in("status", ["confirmed", "completed", "no_show"])
    .gte("start_time", thirtyDaysAgo.toISOString())
    .lte("start_time", now.toISOString());

  let noShowRate: number | null = null;
  if (pastMeetings && pastMeetings.length > 0) {
    const noShows = pastMeetings.filter((b) => b.status === "no_show").length;
    noShowRate = noShows / pastMeetings.length;
  }

  const { data: recentRouteStats } = await supabase
    .from("route_stats")
    .select("naive_seconds, optimized_seconds")
    .eq("business_id", businessId)
    .gte("route_date", format(thirtyDaysAgo, "yyyy-MM-dd"));

  let avgTravelTimeSavedMinutes: number | null = null;
  if (recentRouteStats && recentRouteStats.length > 0) {
    const totalSavedSeconds = recentRouteStats.reduce(
      (sum, r) => sum + Math.max(0, r.naive_seconds - r.optimized_seconds),
      0
    );
    avgTravelTimeSavedMinutes =
      totalSavedSeconds / recentRouteStats.length / 60;
  }

  return {
    meetingsThisWeek: meetingsThisWeek ?? 0,
    noShowRate,
    avgTravelTimeSavedMinutes,
  };
}

export interface WeeklyMeetingsPoint {
  weekLabel: string;
  count: number;
}

/** Meetings per week, last `weeks` weeks (bar chart). */
export async function getMeetingsPerWeek(
  businessId: string,
  weeks = 8
): Promise<WeeklyMeetingsPoint[]> {
  const supabase = createClient();
  const now = new Date();
  const rangeStart = startOfWeek(subWeeks(now, weeks - 1));

  const { data: bookings } = await supabase
    .from("bookings")
    .select("start_time")
    .eq("business_id", businessId)
    .neq("status", "cancelled")
    .neq("status", "pending")
    .gte("start_time", rangeStart.toISOString());

  const buckets: WeeklyMeetingsPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = startOfWeek(subWeeks(now, i));
    const we = endOfWeek(subWeeks(now, i));
    const count = (bookings ?? []).filter((b) => {
      const t = new Date(b.start_time);
      return t >= ws && t <= we;
    }).length;
    buckets.push({ weekLabel: format(ws, "MMM d"), count });
  }

  return buckets;
}

export interface LocationSplitPoint {
  name: string;
  value: number;
}

/** Virtual vs in-person split, all-time (pie/donut chart). */
export async function getLocationSplit(
  businessId: string
): Promise<LocationSplitPoint[]> {
  const supabase = createClient();

  const { data: bookings } = await supabase
    .from("bookings")
    .select("location_type")
    .eq("business_id", businessId)
    .neq("status", "cancelled")
    .neq("status", "pending");

  const virtual = (bookings ?? []).filter((b) => b.location_type === "virtual").length;
  const inPerson = (bookings ?? []).filter((b) => b.location_type === "in_person").length;

  return [
    { name: "Virtual", value: virtual },
    { name: "In-person", value: inPerson },
  ];
}

export interface TravelSavedPoint {
  weekLabel: string;
  minutesSaved: number;
}

/** Travel time saved per week, last `weeks` weeks (line chart). */
export async function getTravelTimeSavedPerWeek(
  businessId: string,
  weeks = 8
): Promise<TravelSavedPoint[]> {
  const supabase = createClient();
  const now = new Date();
  const rangeStart = startOfWeek(subWeeks(now, weeks - 1));

  const { data: rows } = await supabase
    .from("route_stats")
    .select("route_date, naive_seconds, optimized_seconds")
    .eq("business_id", businessId)
    .gte("route_date", format(rangeStart, "yyyy-MM-dd"));

  const points: TravelSavedPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = startOfWeek(subWeeks(now, i));
    const we = endOfWeek(subWeeks(now, i));
    const weekRows = (rows ?? []).filter((r) => {
      const d = startOfDay(new Date(r.route_date));
      return d >= ws && d <= we;
    });
    const totalSavedSeconds = weekRows.reduce(
      (sum, r) => sum + Math.max(0, r.naive_seconds - r.optimized_seconds),
      0
    );
    points.push({
      weekLabel: format(ws, "MMM d"),
      minutesSaved: Math.round(totalSavedSeconds / 60),
    });
  }

  return points;
}
