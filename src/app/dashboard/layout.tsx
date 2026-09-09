import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard/nav";
import { PushRegistration } from "@/components/dashboard/push-registration";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  // middleware.ts + the auth callback should prevent this, but guard
  // anyway in case a business row hasn't been created yet.
  if (!business) redirect("/login?error=no_business");

  if (!business.onboarding_completed) redirect("/onboarding");

  return (
    <div className="min-h-screen bg-background">
      <PushRegistration userId={user.id} />
      <DashboardNav businessName={business.name} plan={business.plan} />
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}
