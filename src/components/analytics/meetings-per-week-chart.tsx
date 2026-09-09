"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeeklyMeetingsPoint } from "@/lib/stats";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function MeetingsPerWeekChart({ data }: { data: WeeklyMeetingsPoint[] }) {
  const allZero = data.every((d) => d.count === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Meetings per week</CardTitle>
      </CardHeader>
      <CardContent>
        {allZero ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No meetings yet — this fills in as bookings come through.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data}>
              <XAxis
                dataKey="weekLabel"
                tick={{ fontSize: 12 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 13,
                }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
