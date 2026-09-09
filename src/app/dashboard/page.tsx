import { subDays, startOfDay, endOfDay } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getQuickStats } from "@/lib/stats";
import { BookingsList } from "@/components/dashboard/bookings-list";
import { PostMeetingPrompts } from "@/components/dashboard/post-meeting-prompts";
import { QuickStatsRow } from "@/components/dashboard/quick-stats";
import { NextMeetingsWidget } from "@/components/dashboard/next-meetings-widget";
import { TodayRouteWidget } from "@/components/dashboard/today-route-widget";
import { BookingLinkWidget } from "@/components/settings/booking-link-widget";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug")
    .eq("owner_user_id", user!.id)
    .single();

  const businessId = business!.id;
  const now = new Date();

  const [
    { data: bookings },
    { data: recentlyEnded },
    { data: nextUp },
    { data: todayInPerson },
    quickStats,
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("*")
      .eq("business_id", businessId)
      .neq("status", "cancelled")
      .gte("start_time", startOfDay(now).toISOString())
      .order("start_time", { ascending: true }),
    supabase
      .from("bookings")
      .select("*, client_notes!left(id)")
      .eq("business_id", businessId)
      .eq("status", "confirmed")
      .not("client_id", "is", null)
      .lt("end_time", now.toISOString())
      .gte("end_time", subDays(now, 7).toISOString())
      .order("end_time", { ascending: false }),
    supabase
      .from("bookings")
      .select("*")
      .eq("business_id", businessId)
      .eq("status", "confirmed")
      .gte("start_time", now.toISOString())
      .order("start_time", { ascending: true })
      .limit(3),
    supabase
      .from("bookings")
      .select("*")
      .eq("business_id", businessId)
      .eq("status", "confirmed")
      .eq("location_type", "in_person")
      .gte("start_time", startOfDay(now).toISOString())
      .lte("start_time", endOfDay(now).toISOString())
      .order("start_time", { ascending: true }),
    getQuickStats(businessId),
  ]);

  const needsNotes = (recentlyEnded ?? []).filter(
    (b: any) => !b.client_notes || b.client_notes.length === 0
  );

  const bookingUrl =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/book/${business!.slug}`
      : `/book/${business!.slug}`;

  return (
    <div className="flex flex-col gap-8">
      {needsNotes.length > 0 && (
        <PostMeetingPrompts bookings={needsNotes as any} businessId={businessId} />
      )}

      <QuickStatsRow stats={quickStats} />

      <div className="grid gap-4 md:grid-cols-2">
        <NextMeetingsWidget bookings={nextUp ?? []} />
        <TodayRouteWidget stops={todayInPerson ?? []} />
      </div>

      <BookingLinkWidget url={bookingUrl} />

      <div>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Upcoming bookings</h1>
            <p className="text-sm text-muted-foreground">
              Confirm pending requests to lock in the time and notify the client.
            </p>
          </div>
        </div>
        <BookingsList bookings={bookings ?? []} />
      </div>
    </div>
  );
}
