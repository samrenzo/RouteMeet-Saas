"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    OneSignalDeferred?: any[];
  }
}

/**
 * Mounted once in the dashboard layout. Loads the OneSignal Web SDK,
 * prompts for push permission, and sets external_id to the owner's
 * Supabase user id — lib/push.ts sends notifications by that same id, so
 * no player-id bookkeeping is needed on our side.
 */
export function PushRegistration({ userId }: { userId: string }) {
  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId) return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      await OneSignal.init({ appId });
      await OneSignal.login(userId);
      // `OneSignal.Notifications.permission`'s exact type (boolean vs.
      // string) has varied across SDK versions and isn't worth pinning
      // down here — requestPermission() itself is safe to call
      // unconditionally, since OneSignal no-ops it (no repeat browser
      // prompt) once the user has already granted or denied.
      OneSignal.Notifications.requestPermission();
    });

    if (!document.getElementById("onesignal-sdk")) {
      const script = document.createElement("script");
      script.id = "onesignal-sdk";
      script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
      script.defer = true;
      document.head.appendChild(script);
    }
  }, [userId]);

  return null;
}
