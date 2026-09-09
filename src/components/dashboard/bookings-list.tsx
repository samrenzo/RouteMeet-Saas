import { format, isToday, isTomorrow } from "date-fns";
import type { Booking } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { confirmBooking, cancelBooking, markNoShow } from "@/app/dashboard/actions";

function dayLabel(date: Date) {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEEE, MMM d");
}

function statusVariant(status: Booking["status"]) {
  switch (status) {
    case "confirmed":
      return "default" as const;
    case "pending":
      return "secondary" as const;
    case "cancelled":
      return "outline" as const;
    case "completed":
      return "accent" as const;
    case "no_show":
      return "destructive" as const;
  }
}

export function BookingsList({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 p-12 text-center">
        <p className="font-medium">No bookings yet</p>
        <p className="text-sm text-muted-foreground">
          Share your booking link to get your first meeting on the calendar.
        </p>
      </Card>
    );
  }

  const groups = new Map<string, Booking[]>();
  for (const booking of bookings) {
    const key = format(new Date(booking.start_time), "yyyy-MM-dd");
    const list = groups.get(key) ?? [];
    list.push(booking);
    groups.set(key, list);
  }

  return (
    <div className="flex flex-col gap-8">
      {Array.from(groups.entries()).map(([key, dayBookings]) => (
        <section key={key}>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            {dayLabel(new Date(dayBookings[0].start_time))}
          </h3>
          <div className="route-timeline flex flex-col gap-4">
            {dayBookings.map((booking, i) => (
              <div key={booking.id} className="flex gap-4">
                <div className="route-dot" data-status={booking.status}>
                  {i + 1}
                </div>
                <Card className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{booking.client_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(booking.start_time), "h:mm a")} –{" "}
                        {format(new Date(booking.end_time), "h:mm a")}
                        {" · "}
                        {booking.location_type === "virtual"
                          ? "Virtual"
                          : booking.address}
                      </p>
                    </div>
                    <Badge variant={statusVariant(booking.status)}>
                      {booking.status.replace("_", " ")}
                    </Badge>
                  </div>
                  {(booking.status === "pending" ||
                    booking.status === "confirmed") && (
                    <div className="mt-3 flex gap-2">
                      {booking.status === "pending" && (
                        <form action={confirmBooking.bind(null, booking.id)}>
                          <Button type="submit" size="sm">
                            Confirm
                          </Button>
                        </form>
                      )}
                      {booking.status === "confirmed" &&
                        booking.location_type === "virtual" &&
                        booking.meet_link && (
                          <Button size="sm" variant="secondary" asChild>
                            <a href={booking.meet_link} target="_blank" rel="noreferrer">
                              Join Meeting
                            </a>
                          </Button>
                        )}
                      <form action={cancelBooking.bind(null, booking.id)}>
                        <Button type="submit" size="sm" variant="outline">
                          Cancel
                        </Button>
                      </form>
                    </div>
                  )}
                  {booking.status === "confirmed" &&
                    new Date(booking.end_time) < new Date() && (
                      <div className="mt-3">
                        <form action={markNoShow.bind(null, booking.id)}>
                          <Button type="submit" size="sm" variant="outline">
                            Mark as no-show
                          </Button>
                        </form>
                      </div>
                    )}
                </Card>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
