import Link from "next/link";
import type { Metadata } from "next";
import { CalendarCheck, Route, Video, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PLANS } from "@/lib/plans";
import type { Plan } from "@/lib/types";

export const metadata: Metadata = {
  title: "RouteMeet — Booking + route optimization for client-facing pros",
  description:
    "RouteMeet combines client booking, automatic route optimization, and multi-channel reminders in one tool for real estate agents, sales reps, consultants, and home service pros.",
  openGraph: {
    title: "RouteMeet — Booking + route optimization for client-facing pros",
    description:
      "Stop losing hours to scheduling and driving between client meetings. RouteMeet handles booking, route optimization, and reminders in one place.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RouteMeet",
    description:
      "Booking + automatic route optimization for small business owners juggling virtual and in-person client meetings.",
  },
};

const FEATURES = [
  {
    icon: CalendarCheck,
    title: "Smart booking",
    description:
      "Clients pick an open slot from your real availability — synced against your Google Calendar so you never get double-booked.",
  },
  {
    icon: Route,
    title: "Automatic route optimization",
    description:
      "In-person meetings get reordered into the fastest driving route for the day, with arrival times and turn-by-turn navigation built in.",
  },
  {
    icon: Video,
    title: "Auto meeting links",
    description:
      "Virtual bookings get a Google Meet link generated automatically and pushed straight to your calendar — no extra steps.",
  },
  {
    icon: BellRing,
    title: "Automated reminders",
    description:
      "Email, SMS, WhatsApp, and push reminders go out on their own, so fewer clients forget and fewer of your days start with a scramble.",
  },
];

export default function LandingPage() {
  return (
    <main>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-semibold tracking-tight">RouteMeet</span>
        <nav className="flex items-center gap-4">
          <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
          <Button size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Stop losing hours to scheduling and driving between client meetings
        </h1>
        <p className="mt-6 text-lg text-muted-foreground">
          RouteMeet combines booking, route optimization, and reminders in
          one tool built for real estate agents, sales reps, consultants,
          and home service pros.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/login">Get started free</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/pricing">View pricing</Link>
          </Button>
        </div>
      </section>

      {/* Feature highlights */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="p-6">
              <feature.icon className="h-6 w-6 text-primary" strokeWidth={1.75} />
              <h3 className="mt-4 font-medium">{feature.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {feature.description}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            Simple, usage-based pricing
          </h2>
          <p className="mt-2 text-muted-foreground">
            Start free. Upgrade when route optimization and client volume
            start paying for themselves.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {(Object.keys(PLANS) as Plan[]).map((planKey) => {
            const plan = PLANS[planKey];
            return (
              <Card key={planKey}>
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>
                    <span className="text-2xl font-semibold text-foreground">
                      ${plan.priceMonthly}
                    </span>{" "}
                    /month
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                    <li>
                      {plan.bookingLimitPerMonth === null
                        ? "Unlimited bookings"
                        : `Up to ${plan.bookingLimitPerMonth} bookings/month`}
                    </li>
                    <li>
                      {plan.virtualOnly ? "Virtual meetings only" : "Virtual + in-person"}
                    </li>
                    <li>{plan.routeOptimization ? "Route optimization" : "No route optimization"}</li>
                    <li>{plan.smsWhatsapp ? "SMS + WhatsApp reminders" : "Email + push reminders"}</li>
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <div className="mt-8 text-center">
          <Button variant="outline" asChild>
            <Link href="/pricing">Compare all features</Link>
          </Button>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">
          Ready to get your time back?
        </h2>
        <div className="mt-6">
          <Button size="lg" asChild>
            <Link href="/login">Sign up with Google</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        RouteMeet
      </footer>
    </main>
  );
}
