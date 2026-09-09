import { format } from "date-fns";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function BookingConfirmedPage({
  searchParams,
}: {
  searchParams: { bookingId?: string };
}) {
  // Service role, same reasoning as the rest of the public booking flow —
  // `bookings` has no anon SELECT policy, so this would silently find
  // nothing (falling back to the generic message below) rather than
  // showing the client their actual confirmed time. The bookingId here is
  // an unguessable UUID the client only has because they just created it,
  // so reading it back this way doesn't expose anything to anyone else.
  const supabase = createServiceRoleClient();
  const { data: booking } = booking_id_query(searchParams.bookingId)
    ? await supabase
        .from("bookings")
        .select("*")
        .eq("id", searchParams.bookingId!)
        .maybeSingle()
    : { data: null };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Request sent</CardTitle>
          <CardDescription>
            {booking
              ? `Your request for ${format(new Date(booking.start_time), "EEEE, MMM d 'at' h:mm a")} is pending confirmation.`
              : "Your booking request has been submitted."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The owner will confirm shortly — you'll get an email once it's
          locked in. If you asked for a virtual meeting, the Meet link goes
          out with that confirmation.
        </CardContent>
      </Card>
    </main>
  );
}

function booking_id_query(id?: string): id is string {
  return typeof id === "string" && id.length > 0;
}
