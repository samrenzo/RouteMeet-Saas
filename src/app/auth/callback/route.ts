import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateBusinessForUser } from "@/lib/business";

// Handles the redirect back from Google via Supabase Auth. Exchanges the
// `code` for a session, ensures a `businesses` row exists for this owner,
// then sends them into onboarding (first sign-in) or the dashboard.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const explicitNext = searchParams.get("next");

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session?.user) {
      // Supabase surfaces the Google provider's refresh token here on
      // first consent (with access_type=offline, prompt=consent from the
      // login page). Phase 2's lib/googleCalendar.ts uses this to mint
      // fresh access tokens without asking the user to sign in again.
      const providerRefreshToken = (data.session as any).provider_refresh_token as
        | string
        | undefined;

      const business = await getOrCreateBusinessForUser({
        userId: data.session.user.id,
        email: data.session.user.email ?? "",
        fullName: (data.session.user.user_metadata?.full_name as string) ?? "",
        googleRefreshToken: providerRefreshToken,
      });

      // Respect an explicit `next` (e.g. someone hit "Upgrade" from
      // /pricing while logged out) unless onboarding still isn't done —
      // finishing onboarding matters more than returning to where they
      // came from.
      const next = !business.onboarding_completed
        ? "/onboarding"
        : (explicitNext ?? "/dashboard");

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
