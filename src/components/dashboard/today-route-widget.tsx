import { format } from "date-fns";
import Link from "next/link";
import type { Booking } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Deliberately reads today's in-person confirmed bookings in their
 * already-stored order (set by the 6 AM cron or the last visit to
 * /dashboard/route) rather than calling computeAndPersistRoute here —
 * recomputing on every Mission Control page load would mean a Distance
 * Matrix + Geocoding round trip on every dashboard visit, which is wasteful
 * and would burn through the Google Maps free tier fast at any real usage.
 */
export function TodayRouteWidget({ stops }: { stops: Booking[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Today's route</CardTitle>
        <Button size="sm" variant="ghost" asChild>
          <Link href="/dashboard/route">View full route →</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {stops.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No in-person meetings today.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {stops.map((stop, i) => (
              <li key={stop.id} className="flex items-center gap-3 text-sm">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="font-medium">{stop.client_name}</span>
                <span className="text-muted-foreground">
                  {format(new Date(stop.start_time), "h:mm a")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
