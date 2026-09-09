"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Business, BusinessHours } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BusinessHoursForm } from "@/components/settings/business-hours-form";
import { BookingLinkWidget } from "@/components/settings/booking-link-widget";
import { saveBusinessBasics, completeOnboarding } from "@/app/onboarding/actions";

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Europe/London",
  "Asia/Kolkata",
];

const STEPS = ["Business basics", "Weekly availability", "Share your link"];

export function OnboardingWizard({
  business,
  initialHours,
  bookingUrl,
}: {
  business: Business;
  initialHours: BusinessHours[];
  bookingUrl: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(business.name);
  const [address, setAddress] = useState(business.home_base_address ?? "");
  const [timezone, setTimezone] = useState(business.timezone);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStep1Continue() {
    if (!name.trim() || !address.trim()) {
      setError("Business name and home base address are both required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await saveBusinessBasics({
          businessId: business.id,
          name: name.trim(),
          homeBaseAddress: address.trim(),
          timezone,
        });
        setStep(1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  function handleFinish() {
    startTransition(async () => {
      await completeOnboarding(business.id);
      router.push("/dashboard");
    });
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                i <= step
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-sm ${i === step ? "font-medium" : "text-muted-foreground"}`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div className="h-px flex-1 bg-border" />
            )}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tell us about your business</CardTitle>
            <CardDescription>
              The home base address is where your driving day starts — used
              later for route optimization.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ob-name">Business name</Label>
              <Input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ob-address">Home base address</Label>
              <Input
                id="ob-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St, Springfield, IL"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ob-timezone">Timezone</Label>
              <select
                id="ob-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleStep1Continue} disabled={isPending}>
              {isPending ? "Saving…" : "Continue"}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              When can clients book you?
            </h2>
            <p className="text-sm text-muted-foreground">
              Turn on the days you're available and set your hours. You can
              change this anytime in Settings.
            </p>
          </div>
          <BusinessHoursForm businessId={business.id} initialHours={initialHours} />
          <Button onClick={() => setStep(2)}>Continue</Button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              You're all set
            </h2>
            <p className="text-sm text-muted-foreground">
              Share this link with clients so they can start booking time
              with you.
            </p>
          </div>
          <BookingLinkWidget url={bookingUrl} />
          <Button onClick={handleFinish} disabled={isPending}>
            {isPending ? "Finishing…" : "Go to dashboard"}
          </Button>
        </div>
      )}
    </div>
  );
}
