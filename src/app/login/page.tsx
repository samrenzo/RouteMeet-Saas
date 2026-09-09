"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Phase 2 needs Calendar scopes/refresh token; requesting them up
        // front avoids a second consent screen later.
        scopes:
          "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy",
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to RouteMeet</CardTitle>
          <CardDescription>
            Use your Google account — this also connects your Calendar so
            RouteMeet can create Meet links and manage availability.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleGoogleSignIn} disabled={loading} className="w-full">
            {loading ? "Redirecting…" : "Continue with Google"}
          </Button>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
