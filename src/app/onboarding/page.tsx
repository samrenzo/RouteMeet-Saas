import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!business) redirect("/login?error=no_business");
  if (business.onboarding_completed) redirect("/dashboard");

  const { data: businessHours } = await supabase
    .from("business_hours")
    .select("*")
    .eq("business_id", business.id)
    .order("day_of_week", { ascending: true });

  const bookingUrl =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/book/${business.slug}`
      : `/book/${business.slug}`;

  return (
    <main className="min-h-screen px-6 py-16">
      <OnboardingWizard
        business={business}
        initialHours={businessHours ?? []}
        bookingUrl={bookingUrl}
      />
    </main>
  );
}
