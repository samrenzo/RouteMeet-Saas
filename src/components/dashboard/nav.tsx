"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/lib/types";

export function DashboardNav({
  businessName,
  plan,
}: {
  businessName: string;
  plan: Plan;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const links = [
    { href: "/dashboard", label: "Bookings" },
    ...(plan !== "free"
      ? [{ href: "/dashboard/route", label: "Today's Route" }]
      : []),
    { href: "/dashboard/clients", label: "Clients" },
    { href: "/dashboard/analytics", label: "Analytics" },
    { href: "/dashboard/billing", label: "Billing" },
    { href: "/dashboard/settings", label: "Settings" },
  ];

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <span className="font-semibold tracking-tight">RouteMeet</span>
          <nav className="flex gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground",
                  pathname === link.href && "bg-secondary text-foreground"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{businessName}</span>
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
