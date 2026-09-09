import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  getMeetingsPerWeek,
  getLocationSplit,
  getTravelTimeSavedPerWeek,
} from "@/lib/stats";
import { MeetingsPerWeekChart } from "@/components/analytics/meetings-per-week-chart";
import { VirtualInPersonChart } from "@/components/analytics/virtual-in-person-chart";
import { TravelTimeSavedChart } from "@/components/analytics/travel-time-saved-chart";
import { Skeleton } from "@/components/ui/skeleton";

async function getBusinessId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_user_id", user!.id)
    .single();
  return business!.id;
}

async function MeetingsSection() {
  const businessId = await getBusinessId();
  const data = await getMeetingsPerWeek(businessId);
  return <MeetingsPerWeekChart data={data} />;
}

async function LocationSplitSection() {
  const businessId = await getBusinessId();
  const data = await getLocationSplit(businessId);
  return <VirtualInPersonChart data={data} />;
}

async function TravelSavedSection() {
  const businessId = await getBusinessId();
  const data = await getTravelTimeSavedPerWeek(businessId);
  return <TravelTimeSavedChart data={data} />;
}

function ChartSkeleton() {
  return (
    <div className="rounded-lg border border-border p-6">
      <Skeleton className="mb-4 h-4 w-40" />
      <Skeleton className="h-60 w-full" />
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          How your bookings and routes are trending.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Suspense fallback={<ChartSkeleton />}>
          <MeetingsSection />
        </Suspense>
        <Suspense fallback={<ChartSkeleton />}>
          <LocationSplitSection />
        </Suspense>
      </div>

      <Suspense fallback={<ChartSkeleton />}>
        <TravelSavedSection />
      </Suspense>
    </div>
  );
}
