"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import type { Booking } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { addClientNote } from "@/app/dashboard/clients/actions";

export function PostMeetingPrompts({
  bookings,
  businessId,
}: {
  bookings: (Booking & { client_id: string })[];
  businessId: string;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = bookings.filter((b) => !dismissed.has(b.id));

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {visible.map((booking) => (
        <PromptCard
          key={booking.id}
          booking={booking}
          businessId={businessId}
          onDone={() => setDismissed((prev) => new Set(prev).add(booking.id))}
        />
      ))}
    </div>
  );
}

function PromptCard({
  booking,
  businessId,
  onDone,
}: {
  booking: Booking & { client_id: string };
  businessId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <Card className="flex items-center justify-between p-4">
        <p className="text-sm">
          Add notes for your meeting with{" "}
          <span className="font-medium">{booking.client_name}</span>?
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setOpen(true)}>
            Add notes
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Dismiss
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <p className="mb-2 text-sm font-medium">
        Notes for {booking.client_name} —{" "}
        {format(new Date(booking.start_time), "MMM d")}
      </p>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        autoFocus
      />
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          disabled={!body.trim() || isPending}
          onClick={() =>
            startTransition(async () => {
              await addClientNote({
                clientId: booking.client_id,
                businessId,
                bookingId: booking.id,
                body: body.trim(),
              });
              onDone();
            })
          }
        >
          {isPending ? "Saving…" : "Save note"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Skip
        </Button>
      </div>
    </Card>
  );
}
