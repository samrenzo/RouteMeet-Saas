import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/plans";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { openBillingPortal } from "./actions";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { checkout?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_user_id", user!.id)
    .single();

  const plan = PLANS[business!.plan];
  const usage = business!.bookings_this_month;
  const limit = plan.bookingLimitPerMonth;
  const usagePct = limit ? Math.min(100, Math.round((usage / limit) * 100)) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
      </div>

      {searchParams.checkout === "success" && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-primary">
          Upgrade complete — thanks! It may take a few seconds for your new
          plan to show below.
        </div>
      )}
      {searchParams.checkout === "cancelled" && (
        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Checkout was cancelled — no changes made.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Current plan: {plan.name}</CardTitle>
          <CardDescription>
            ${plan.priceMonthly}/month
            {business!.plan !== "free" && " · billed via Stripe"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <p className="mb-1 text-sm font-medium">
              Bookings this month: {usage}
              {limit !== null ? ` / ${limit}` : " (unlimited)"}
            </p>
            {limit !== null && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            )}
          </div>

          <div className="flex gap-3">
            {business!.stripe_customer_id ? (
              <form action={openBillingPortal}>
                <Button type="submit" variant="secondary">
                  Manage Subscription
                </Button>
              </form>
            ) : (
              <Button variant="secondary" asChild>
                <Link href="/pricing">View plans</Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/pricing">Compare plans</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
