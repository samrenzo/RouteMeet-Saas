import "server-only";
import { randomUUID } from "crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const PRIMARY_CALENDAR_ID = "primary";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

/**
 * Exchanges a stored Google OAuth refresh token (captured at sign-in, see
 * src/lib/business.ts) for a short-lived access token. Requires the SAME
 * OAuth client (GOOGLE_CLIENT_ID/SECRET) that's configured as the Google
 * provider in Supabase's Auth settings — the refresh token is only valid
 * against the client that issued it.
 */
async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to refresh Google access token (${res.status}): ${body}`
    );
  }

  const data = (await res.json()) as GoogleTokenResponse;
  return data.access_token;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  timezone: string;
  attendeeEmail: string;
  locationType: "virtual" | "in_person";
  address?: string | null;
}

export interface CalendarEventResult {
  eventId: string;
  meetLink: string | null;
}

/**
 * Creates a Calendar event on the owner's primary calendar. For virtual
 * bookings, requests Google auto-generate a Meet link via
 * conferenceData.createRequest. Adds the client as an attendee so they
 * get a native Calendar invite alongside RouteMeet's own emails (Phase 4).
 */
export async function createCalendarEvent(
  refreshToken: string,
  input: CalendarEventInput
): Promise<CalendarEventResult> {
  const accessToken = await getAccessToken(refreshToken);

  const isVirtual = input.locationType === "virtual";

  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startIso, timeZone: input.timezone },
    end: { dateTime: input.endIso, timeZone: input.timezone },
    attendees: [{ email: input.attendeeEmail }],
  };

  if (!isVirtual && input.address) {
    body.location = input.address;
  }

  if (isVirtual) {
    body.conferenceData = {
      createRequest: {
        requestId: randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const url = new URL(
    `${CALENDAR_API}/calendars/${PRIMARY_CALENDAR_ID}/events`
  );
  url.searchParams.set("sendUpdates", "all");
  if (isVirtual) url.searchParams.set("conferenceDataVersion", "1");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Failed to create Calendar event (${res.status}): ${errBody}`);
  }

  const event = await res.json();
  const meetLink: string | null =
    event.conferenceData?.entryPoints?.find(
      (ep: any) => ep.entryPointType === "video"
    )?.uri ?? null;

  return { eventId: event.id as string, meetLink };
}

/**
 * Patches an existing event's start/end time — used when Phase 3's route
 * optimizer re-times a stop after reordering the day.
 */
export async function patchCalendarEventTime(
  refreshToken: string,
  eventId: string,
  startIso: string,
  endIso: string,
  timezone: string
): Promise<void> {
  const accessToken = await getAccessToken(refreshToken);

  const res = await fetch(
    `${CALENDAR_API}/calendars/${PRIMARY_CALENDAR_ID}/events/${eventId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start: { dateTime: startIso, timeZone: timezone },
        end: { dateTime: endIso, timeZone: timezone },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Failed to patch Calendar event (${res.status}): ${errBody}`);
  }
}

/** Deletes a Calendar event — called when a booking is cancelled. */
export async function deleteCalendarEvent(
  refreshToken: string,
  eventId: string
): Promise<void> {
  const accessToken = await getAccessToken(refreshToken);

  const url = new URL(
    `${CALENDAR_API}/calendars/${PRIMARY_CALENDAR_ID}/events/${eventId}`
  );
  url.searchParams.set("sendUpdates", "all");

  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // Google returns 410 Gone if the event was already deleted — treat as success.
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    const errBody = await res.text();
    throw new Error(`Failed to delete Calendar event (${res.status}): ${errBody}`);
  }
}

export interface BusyPeriod {
  start: Date;
  end: Date;
}

/**
 * Queries freebusy for the owner's primary calendar between timeMin/timeMax.
 * Used by the public booking page so external events on the owner's real
 * Google Calendar (not just RouteMeet bookings) also block slots.
 */
export async function getFreeBusy(
  refreshToken: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<BusyPeriod[]> {
  const accessToken = await getAccessToken(refreshToken);

  const res = await fetch(`${CALENDAR_API}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      items: [{ id: PRIMARY_CALENDAR_ID }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Failed to query freebusy (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  const busy = data.calendars?.[PRIMARY_CALENDAR_ID]?.busy ?? [];

  return busy.map((b: { start: string; end: string }) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));
}
