import { format } from "date-fns";
import type { RouteResult } from "@/lib/routeService";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function minutes(seconds: number) {
  if (seconds < 0) return "unknown";
  return `${Math.round(seconds / 60)} min`;
}

export function RouteList({ route }: { route: RouteResult }) {
  if (route.stops.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        No in-person meetings scheduled for this day.
      </Card>
    );
  }

  const savedSeconds = Math.max(
    0,
    route.naiveOrderTotalTravelSeconds - route.optimizedTotalTravelSeconds
  );

  return (
    <div className="flex flex-col gap-4">
      {savedSeconds > 0 && (
        <p className="text-sm text-muted-foreground">
          Optimized order saves ~{minutes(savedSeconds)} of driving vs. the
          order these were booked in.
        </p>
      )}

      <div className="route-timeline flex flex-col gap-4">
        {route.stops.map((stop, i) => {
          const prevPoint =
            i === 0
              ? route.homeBase
              : { lat: route.stops[i - 1].lat, lng: route.stops[i - 1].lng };
          const navUrl = prevPoint
            ? `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`
            : undefined;

          return (
            <div key={stop.bookingId} className="flex gap-4">
              <div className="route-dot">{stop.order}</div>
              <Card className="flex-1 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{stop.clientName}</p>
                    <p className="text-sm text-muted-foreground">{stop.address}</p>
                    <p className="mt-1 text-sm">
                      Arrive {format(new Date(stop.arrival), "h:mm a")} · depart{" "}
                      {format(new Date(stop.departure), "h:mm a")}
                    </p>
                    {stop.travelSecondsFromPrevious >= 0 && (
                      <p className="text-xs text-muted-foreground">
                        {minutes(stop.travelSecondsFromPrevious)} drive from{" "}
                        {i === 0 ? "home base" : "previous stop"}
                      </p>
                    )}
                  </div>
                  {navUrl && (
                    <Button size="sm" variant="secondary" asChild>
                      <a href={navUrl} target="_blank" rel="noreferrer">
                        Start Navigation
                      </a>
                    </Button>
                  )}
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
