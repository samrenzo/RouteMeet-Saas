import { Card } from "@/components/ui/card";
import type { QuickStats } from "@/lib/stats";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export function QuickStatsRow({ stats }: { stats: QuickStats }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard label="Meetings this week" value={String(stats.meetingsThisWeek)} />
      <StatCard
        label="No-show rate"
        value={
          stats.noShowRate === null ? "—" : `${Math.round(stats.noShowRate * 100)}%`
        }
        hint="last 4 weeks"
      />
      <StatCard
        label="Avg. travel time saved"
        value={
          stats.avgTravelTimeSavedMinutes === null
            ? "—"
            : `${Math.round(stats.avgTravelTimeSavedMinutes)} min/day`
        }
        hint="optimized vs. booking order"
      />
    </div>
  );
}
