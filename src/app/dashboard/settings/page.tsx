import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BusinessHoursForm } from "@/components/settings/business-hours-form";
import { NotificationPreferencesForm } from "@/components/settings/notification-preferences-form";
import { BookingLinkWidget } from "@/components/settings/booking-link-widget";
import { TeamSection } from "@/components/settings/team-section";
import { updateBusinessProfile } from "./actions";

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Europe/London",
  "Asia/Kolkata",
];

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_user_id", user!.id)
    .single();

  const { data: businessHours } = await supabase
    .from("business_hours")
    .select("*")
    .eq("business_id", business!.id)
    .order("day_of_week", { ascending: true });

  const { data: teamInvites } = await supabase
    .from("team_invites")
    .select("*")
    .eq("business_id", business!.id)
    .order("invited_at", { ascending: false });

  const bookingUrl =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/book/${business!.slug}`
      : `/book/${business!.slug}`;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>

      <BookingLinkWidget url={bookingUrl} />

      <Card>
        <CardHeader>
          <CardTitle>Business profile</CardTitle>
          <CardDescription>
            The home base address is used later for route optimization — enter
            the address you start your driving day from.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateBusinessProfile} className="flex flex-col gap-4">
            <input type="hidden" name="businessId" value={business!.id} />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Business name</Label>
              <Input id="name" name="name" defaultValue={business!.name} required />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="homeBaseAddress">Home base address</Label>
              <Input
                id="homeBaseAddress"
                name="homeBaseAddress"
                defaultValue={business!.home_base_address ?? ""}
                placeholder="123 Main St, Springfield, IL"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="timezone">Timezone</Label>
              <select
                id="timezone"
                name="timezone"
                defaultValue={business!.timezone}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Button type="submit">Save profile</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">
          Weekly availability
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Clients can only book slots inside the windows you enable below.
        </p>
        <BusinessHoursForm
          businessId={business!.id}
          initialHours={businessHours ?? []}
        />
      </div>

      <div>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">
          Notification preferences
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Client booking confirmations always go out by email — these
          toggles control your own reminders and summaries.
        </p>
        <NotificationPreferencesForm business={business!} />
      </div>

      <div>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Team</h2>
        <TeamSection
          businessId={business!.id}
          isBusinessPlan={business!.plan === "business"}
          invites={teamInvites ?? []}
        />
      </div>
    </div>
  );
}
