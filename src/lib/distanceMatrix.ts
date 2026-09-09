import "server-only";

const DISTANCE_MATRIX_URL =
  "https://maps.googleapis.com/maps/api/distancematrix/json";

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Builds an (n x n) travel-time matrix (seconds) for the given points,
 * where points[0] is expected to be the owner's home base and the rest
 * are stops. Uses origins=destinations=points so the whole matrix comes
 * back in a single Distance Matrix API call rather than one call per pair.
 *
 * Google caps Distance Matrix at 25 origins x 25 destinations per request
 * (and 100 elements/request on the free tier) — fine for a single day's
 * route, which realistically won't exceed a handful of stops.
 */
export async function buildTravelTimeMatrix(
  points: GeoPoint[]
): Promise<number[][]> {
  if (points.length > 25) {
    throw new Error(
      `Distance Matrix supports at most 25 points per call; got ${points.length}`
    );
  }

  const locations = points.map((p) => `${p.lat},${p.lng}`).join("|");

  const url = new URL(DISTANCE_MATRIX_URL);
  url.searchParams.set("origins", locations);
  url.searchParams.set("destinations", locations);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY!);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Distance Matrix request failed (${res.status})`);
  }

  const data = await res.json();
  if (data.status !== "OK") {
    throw new Error(`Distance Matrix API error: ${data.status}`);
  }

  const matrix: number[][] = data.rows.map((row: any) =>
    row.elements.map((el: any) =>
      el.status === "OK" ? (el.duration.value as number) : Infinity
    )
  );

  return matrix;
}
