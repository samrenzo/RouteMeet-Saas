"use client";

import { useState, useTransition } from "react";
import type { BusinessHours } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { updateBusinessHours } from "@/app/dashboard/settings/actions";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DayRow {
  enabled: boolean;
  start_time: string;
  end_time: string;
}

function buildInitialRows(existing: BusinessHours[]): DayRow[] {
  return Array.from({ length: 7 }, (_, day) => {
    const match = existing.find((h) => h.day_of_week === day);
    return {
      enabled: !!match,
      start_time: match?.start_time.slice(0, 5) ?? "09:00",
      end_time: match?.end_time.slice(0, 5) ?? "17:00",
    };
  });
}

export function BusinessHoursForm({
  businessId,
  initialHours,
}: {
  businessId: string;
  initialHours: BusinessHours[];
}) {
  const [rows, setRows] = useState<DayRow[]>(() => buildInitialRows(initialHours));
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(day: number, patch: Partial<DayRow>) {
    setRows((prev) => prev.map((r, i) => (i === day ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateBusinessHours({
          businessId,
          rows: rows
            .map((row, day) => ({ ...row, day_of_week: day }))
            .filter((row) => row.enabled)
            .map(({ day_of_week, start_time, end_time }) => ({
              day_of_week,
              start_time,
              end_time,
            })),
        });
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save hours");
      }
    });
  }

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-3">
        {rows.map((row, day) => (
          <div key={day} className="flex items-center gap-4">
            <label className="flex w-28 items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(e) => updateRow(day, { enabled: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              {DAY_LABELS[day]}
            </label>
            <Input
              type="time"
              value={row.start_time}
              disabled={!row.enabled}
              onChange={(e) => updateRow(day, { start_time: e.target.value })}
              className="w-32"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="time"
              value={row.end_time}
              disabled={!row.enabled}
              onChange={(e) => updateRow(day, { end_time: e.target.value })}
              className="w-32"
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save availability"}
        </Button>
        {saved && <span className="text-sm text-primary">Saved.</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </Card>
  );
}
