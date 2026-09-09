"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Business } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { updateNotificationPreferences } from "@/app/dashboard/settings/actions";

interface ToggleRow {
  key: "notifyEmail" | "notifySms" | "notifyWhatsapp" | "notifyPush";
  label: string;
  description: string;
  businessOnly?: boolean;
}

const TOGGLES: ToggleRow[] = [
  {
    key: "notifyEmail",
    label: "Email",
    description: "Your own copy of booking confirmations + the daily itinerary email.",
  },
  {
    key: "notifySms",
    label: "SMS",
    description: "Sends clients a text reminder ~2 hours before their meeting.",
    businessOnly: true,
  },
  {
    key: "notifyWhatsapp",
    label: "WhatsApp",
    description: "Sends you a WhatsApp summary of today's route each morning.",
    businessOnly: true,
  },
  {
    key: "notifyPush",
    label: "Push",
    description: "Browser push for new bookings and a 15-minute meeting reminder.",
  },
];

export function NotificationPreferencesForm({ business }: { business: Business }) {
  const isBusinessPlan = business.plan === "business";
  // Clamp SMS/WhatsApp to false on load if the business isn't (or no
  // longer is) on the Business plan. Without this, a business that had
  // them on before downgrading would load with the checkboxes checked
  // *and* disabled — the user could never uncheck them, and saving any
  // other preference would keep resubmitting true values that the server
  // action now rejects, silently blocking every save.
  const [prefs, setPrefs] = useState({
    notifyEmail: business.notify_email,
    notifySms: isBusinessPlan ? business.notify_sms : false,
    notifyWhatsapp: isBusinessPlan ? business.notify_whatsapp : false,
    notifyPush: business.notify_push,
  });
  const [ownerPhone, setOwnerPhone] = useState(business.owner_phone ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateNotificationPreferences({
          businessId: business.id,
          ...prefs,
          ownerPhone,
        });
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save preferences");
      }
    });
  }

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4">
        {TOGGLES.map((toggle) => {
          const disabled = toggle.businessOnly && !isBusinessPlan;
          return (
            <label
              key={toggle.key}
              className={`flex items-start gap-3 ${disabled ? "opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-border"
                checked={prefs[toggle.key]}
                disabled={disabled}
                onChange={(e) => {
                  setPrefs((p) => ({ ...p, [toggle.key]: e.target.checked }));
                  setSaved(false);
                }}
              />
              <span>
                <span className="flex items-center gap-2 text-sm font-medium">
                  {toggle.label}
                  {disabled && <Badge variant="outline">Business plan</Badge>}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {toggle.description}
                </span>
              </span>
            </label>
          );
        })}

        <div className="flex flex-col gap-1.5 pt-2">
          <Label htmlFor="ownerPhone">Your phone number (for SMS/WhatsApp)</Label>
          <Input
            id="ownerPhone"
            value={ownerPhone}
            onChange={(e) => {
              setOwnerPhone(e.target.value);
              setSaved(false);
            }}
            placeholder="+15551234567"
            className="max-w-xs"
            disabled={!isBusinessPlan}
          />
          {!isBusinessPlan && (
            <p className="text-xs text-muted-foreground">
              SMS and WhatsApp are on the{" "}
              <Link href="/pricing" className="underline">
                Business plan
              </Link>
              .
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save notification preferences"}
        </Button>
        {saved && <span className="text-sm text-primary">Saved.</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </Card>
  );
}
