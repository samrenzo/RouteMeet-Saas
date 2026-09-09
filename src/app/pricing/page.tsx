import { createClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/plans";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/lib/types";
import { startCheckout } from "./actions";

const FEATURES: { key: keyof (typeof PLANS)["free"]; label: (v: any) => string }[] = [
  {
    key: "bookingLimitPerMonth",
    label: (v) => (v === null ? "Unlimited bookings" : `Up to ${v} bookings/month`),
  },
  { key: "virtualOnly", label: (v) => (v ? "Virtual meetings only" : "Virtual + in-person meetings") },
  { key: "routeOptimization", label: (v) => (v ? "Route optimization" : "No route optimization") },
  { key: "smsWhatsapp", label: (v) => (v ? "SMS + WhatsApp reminders" : "No SMS/WhatsApp") },
  { key: "multiUser", label: (v) => (v ? "Multi-user support" : "Single user") },
  { key: "aiFollowUp", label: (v) => (v ? "AI follow-up email drafts" : "No AI drafting") },
];

export default async function PricingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let currentPlan: Plan | null = null;
  if (user) {
    const { data: business } = await supabase
      .from("businesses")
      .select("plan")
      .eq("owner_user_id", user.id)
      .single();
    currentPlan = business?.plan ?? null;
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-2 text-muted-foreground">
          Start free. Upgrade when route optimization and client volume
          start paying for themselves.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {(Object.keys(PLANS) as Plan[]).map((planKey) => {
          const plan = PLANS[planKey];
          const isCurrent = currentPlan === planKey;

          return (
            <Card key={planKey} className={isCurrent ? "border-primary" : ""}>
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>
                  <span className="text-2xl font-semibold text-foreground">
                    ${plan.priceMonthly}
                  </span>{" "}
                  /month
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ul className="flex flex-col gap-2 text-sm">
                  {FEATURES.map((f) => (
                    <li key={f.key} className="text-muted-foreground">
                      {f.label(plan[f.key])}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <Button disabled variant="secondary">
                    Current plan
                  </Button>
                ) : planKey === "free" ? (
                  <Button variant="outline" disabled>
                    {user ? "Downgrade in Billing" : "Sign up free"}
                  </Button>
                ) : (
                  <form action={startCheckout.bind(null, planKey as "pro" | "business")}>
                    <Button type="submit" className="w-full">
                      Upgrade to {plan.name}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
