import { addDays, addMinutes, isBefore, startOfDay } from "date-fns";
import type { Booking, BusinessHours } from "@/lib/types";

export const SLOT_DURATION_MINUTES = 30;
export const DAYS_AHEAD = 14;

export interface Slot {
  start: Date;
  end: Date;
}

/**
 * Builds bookable slots for the next `DAYS_AHEAD` days from the owner's
 * weekly `business_hours`, minus anything already occupied by a
 * pending/confirmed booking.
 *
 * Phase 2 adds a Google Calendar `freebusy.query` check on top of this —
 * for now, "occupied" only means an existing row in `bookings`.
 */
export function computeAvailableSlots(
  businessHours: BusinessHours[],
  existingBookings: Booking[],
  now: Date = new Date(),
  externalBusy: { start: Date; end: Date }[] = []
): Slot[] {
  const hoursByDay = new Map<number, BusinessHours[]>();
  for (const bh of businessHours) {
    const list = hoursByDay.get(bh.day_of_week) ?? [];
    list.push(bh);
    hoursByDay.set(bh.day_of_week, list);
  }

  // Merges RouteMeet's own bookings with busy periods pulled from the
  // owner's real Google Calendar (Phase 2's freebusy.query) — either kind
  // of overlap blocks a slot.
  const busy = [
    ...existingBookings
      .filter((b) => b.status === "pending" || b.status === "confirmed")
      .map((b) => ({ start: new Date(b.start_time), end: new Date(b.end_time) })),
    ...externalBusy,
  ];

  const slots: Slot[] = [];

  for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
    const day = addDays(startOfDay(now), dayOffset);
    const dayOfWeek = day.getDay();
    const windows = hoursByDay.get(dayOfWeek);
    if (!windows || windows.length === 0) continue;

    for (const window of windows) {
      const [startH, startM] = window.start_time.split(":").map(Number);
      const [endH, endM] = window.end_time.split(":").map(Number);

      let cursor = new Date(day);
      cursor.setHours(startH, startM, 0, 0);
      const windowEnd = new Date(day);
      windowEnd.setHours(endH, endM, 0, 0);

      while (isBefore(cursor, windowEnd)) {
        const slotEnd = addMinutes(cursor, SLOT_DURATION_MINUTES);
        if (slotEnd > windowEnd) break;

        const inPast = isBefore(cursor, now);
        const overlapsBusy = busy.some(
          (b) => cursor < b.end && slotEnd > b.start
        );

        if (!inPast && !overlapsBusy) {
          slots.push({ start: new Date(cursor), end: slotEnd });
        }

        cursor = slotEnd;
      }
    }
  }

  return slots;
}

/** Groups slots by calendar day for rendering a day-by-day picker. */
export function groupSlotsByDay(slots: Slot[]): Map<string, Slot[]> {
  const grouped = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = startOfDay(slot.start).toISOString();
    const list = grouped.get(key) ?? [];
    list.push(slot);
    grouped.set(key, list);
  }
  return grouped;
}
