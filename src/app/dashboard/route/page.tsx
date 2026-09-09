"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import type { RouteResult } from "@/lib/routeService";
import { RouteMap } from "@/components/route/route-map";
import { RouteList } from "@/components/route/route-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export default function RoutePage() {
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  async function loadRoute(targetDate: string) {
    setLoading(true);
    setError(null);
    setUpgradeRequired(false);
    try {
      const res = await fetch(`/api/route/${targetDate}`);
      const data = await res.json();
      if (!res.ok) {
        if (data.upgradeRequired) setUpgradeRequired(true);
        throw new Error(data.error ?? "Failed to load route");
      }
      setRoute(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load route");
      setRoute(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRoute(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today's Route</h1>
          <p className="text-sm text-muted-foreground">
            In-person stops, ordered to minimize total driving time.
          </p>
        </div>
        {!upgradeRequired && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-40"
            />
            <Button onClick={() => loadRoute(date)} variant="outline" disabled={loading}>
              Recompute
            </Button>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && upgradeRequired && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-12 text-center">
          <p className="font-medium">Route optimization is a Pro feature</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Upgrade to automatically order your in-person stops and save
            drive time every day.
          </p>
          <Button asChild>
            <Link href="/pricing">View plans</Link>
          </Button>
        </div>
      )}

      {!loading && error && !upgradeRequired && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && route && (
        <>
          <RouteMap route={route} />
          <RouteList route={route} />
        </>
      )}
    </div>
  );
}
