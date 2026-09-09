import { format } from "date-fns";
import type { Booking } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function NextMeetingsWidget({ bookings }: { bookings: Booking[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Next up</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {bookings.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing else scheduled.</p>
        )}
        {bookings.map((booking) => (
          <div
            key={booking.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{booking.client_name}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(booking.start_time), "MMM d, h:mm a")}
              </p>
            </div>
            {booking.location_type === "virtual" && booking.meet_link ? (
              <Button size="sm" variant="secondary" asChild>
                <a href={booking.meet_link} target="_blank" rel="noreferrer">
                  Join Meeting
                </a>
              </Button>
            ) : booking.location_type === "in_person" && booking.address ? (
              <Button size="sm" variant="secondary" asChild>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(booking.address)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Get Directions
                </a>
              </Button>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
