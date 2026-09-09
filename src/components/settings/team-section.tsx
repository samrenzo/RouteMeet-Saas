"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { inviteTeamMember } from "@/app/dashboard/settings/actions";
import type { TeamInvite } from "@/lib/types";

export function TeamSection({
  businessId,
  isBusinessPlan,
  invites,
}: {
  businessId: string;
  isBusinessPlan: boolean;
  invites: TeamInvite[];
}) {
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localInvites, setLocalInvites] = useState(invites);

  function handleInvite() {
    if (!email.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await inviteTeamMember({ businessId, email: email.trim() });
        setLocalInvites((prev) => [
          { id: crypto.randomUUID(), business_id: businessId, email: email.trim(), invited_at: new Date().toISOString() },
          ...prev,
        ]);
        setEmail("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to send invite");
      }
    });
  }

  return (
    <Card className={`p-6 ${!isBusinessPlan ? "opacity-60" : ""}`}>
      <div className="mb-3 flex items-center gap-2">
        <p className="font-medium">Team members</p>
        {!isBusinessPlan && <Badge variant="outline">Business plan</Badge>}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Invite teammates to help manage bookings.{" "}
        {!isBusinessPlan && (
          <>
            Requires the{" "}
            <Link href="/pricing" className="underline">
              Business plan
            </Link>
            .
          </>
        )}
      </p>

      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="teammate@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!isBusinessPlan}
          className="max-w-xs"
        />
        <Button onClick={handleInvite} disabled={!isBusinessPlan || isPending || !email.trim()}>
          {isPending ? "Sending…" : "Send invite"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {localInvites.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1 text-sm text-muted-foreground">
          {localInvites.map((invite) => (
            <li key={invite.id}>
              {invite.email} — invited {format(new Date(invite.invited_at), "MMM d, yyyy")}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
