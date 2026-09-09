"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { createBooking } from "@/app/book/[businessSlug]/actions";

export interface SerializedSlot {
  startIso: string;
  endIso: string;
}

export function BookingFlow({
  businessSlug,
  slots,
  allowInPerson,
}: {
  businessSlug: string;
  slots: SerializedSlot[];
  allowInPerson: boolean;
}) {
  const [selectedSlot, setSelectedSlot] = useState<SerializedSlot | null>(null);
  const [locationType, setLocationType] = useState<"virtual" | "in_person">(
    "virtual"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayGroups = useMemo(() => {
    const groups = new Map<string, SerializedSlot[]>();
    for (const slot of slots) {
      const key = format(new Date(slot.startIso), "yyyy-MM-dd");
      const list = groups.get(key) ?? [];
      list.push(slot);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [slots]);

  const [activeDay, setActiveDay] = useState<string | null>(
    dayGroups[0]?.[0] ?? null
  );

  if (slots.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        No open slots in the next two weeks. Please check back soon.
      </Card>
    );
  }

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    try {
      await createBooking(formData);
    } catch (e) {
      // redirect() throws internally on success — only real errors land here.
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          1. Choose a time
        </h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {dayGroups.map(([day]) => (
            <button
              key={day}
              onClick={() => {
                setActiveDay(day);
                setSelectedSlot(null);
              }}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                activeDay === day
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-secondary"
              }`}
            >
              {format(new Date(day), "EEE, MMM d")}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {dayGroups
            .find(([day]) => day === activeDay)?.[1]
            .map((slot) => (
              <button
                key={slot.startIso}
                onClick={() => setSelectedSlot(slot)}
                className={`rounded-md border px-2 py-2 text-sm ${
                  selectedSlot?.startIso === slot.startIso
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-secondary"
                }`}
              >
                {format(new Date(slot.startIso), "h:mm a")}
              </button>
            ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          2. Your details
        </h2>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="businessSlug" value={businessSlug} />
          <input
            type="hidden"
            name="startTimeIso"
            value={selectedSlot?.startIso ?? ""}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clientName">Name</Label>
            <Input id="clientName" name="clientName" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clientEmail">Email</Label>
            <Input id="clientEmail" name="clientEmail" type="email" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clientPhone">Phone (optional)</Label>
            <Input id="clientPhone" name="clientPhone" type="tel" />
          </div>

          {allowInPerson && (
            <div className="flex flex-col gap-1.5">
              <Label>Meeting type</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLocationType("virtual")}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                    locationType === "virtual"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  Virtual (Google Meet)
                </button>
                <button
                  type="button"
                  onClick={() => setLocationType("in_person")}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                    locationType === "in_person"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  In person
                </button>
              </div>
            </div>
          )}
          <input type="hidden" name="locationType" value={locationType} />

          {locationType === "in_person" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address">Meeting address</Label>
              <Input
                id="address"
                name="address"
                placeholder="Where should they meet you?"
                required
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={!selectedSlot || submitting}>
            {submitting
              ? "Booking…"
              : selectedSlot
                ? `Book ${format(new Date(selectedSlot.startIso), "MMM d, h:mm a")}`
                : "Select a time first"}
          </Button>
        </form>
      </div>
    </div>
  );
}
