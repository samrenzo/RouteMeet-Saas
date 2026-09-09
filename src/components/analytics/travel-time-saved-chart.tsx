"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TravelSavedPoint } from "@/lib/stats";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function TravelTimeSavedChart({ data }: { data: TravelSavedPoint[] }) {
  const allZero = data.every((d) => d.minutesSaved === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Travel time saved per week</CardTitle>
      </CardHeader>
      <CardContent>
        {allZero ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No optimized routes yet — this fills in once you have in-person
            days with 2+ stops.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data}>
              <XAxis
                dataKey="weekLabel"
                tick={{ fontSize: 12 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="hsl(var(--muted-foreground))"
                label={{ value: "min", position: "insideLeft", fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 13,
                }}
                formatter={(value: number) => [`${value} min`, "Saved"]}
              />
              <Line
                type="monotone"
                dataKey="minutesSaved"
                stroke="hsl(var(--accent))"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
