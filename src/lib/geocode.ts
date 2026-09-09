import "server-only";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

/**
 * Converts a free-text address into lat/lng. Called at booking confirmation
 * time (see src/app/dashboard/actions.ts) so route optimization always has
 * coordinates to work with, and again defensively in the route service in
 * case an older booking slipped through without them.
 */
export async function geocodeAddress(
  address: string
): Promise<GeocodeResult | null> {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("address", address);
  url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY!);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Geocoding request failed (${res.status})`);
  }

  const data = await res.json();

  if (data.status !== "OK" || !data.results?.[0]) {
    console.error("Geocoding failed:", data.status, data.error_message);
    return null;
  }

  const result = data.results[0];
  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
  };
}
