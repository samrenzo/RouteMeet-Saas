"use client";

import { useEffect, useRef, useState } from "react";
import type { RouteResult } from "@/lib/routeService";

declare global {
  interface Window {
    google: any;
    __routemeetMapsCallback?: () => void;
  }
}

let mapsScriptPromise: Promise<void> | null = null;

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (mapsScriptPromise) return mapsScriptPromise;

  mapsScriptPromise = new Promise((resolve) => {
    window.__routemeetMapsCallback = () => resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=__routemeetMapsCallback`;
    script.async = true;
    document.head.appendChild(script);
  });

  return mapsScriptPromise;
}

export function RouteMap({ route }: { route: RouteResult }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setError("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured.");
      return;
    }
    if (!mapRef.current || !route.homeBase) return;

    let cancelled = false;

    loadGoogleMapsScript(apiKey).then(() => {
      if (cancelled || !mapRef.current) return;
      const { google } = window;

      const map = new google.maps.Map(mapRef.current, {
        center: route.homeBase,
        zoom: 11,
        disableDefaultUI: true,
        zoomControl: true,
      });

      const bounds = new google.maps.LatLngBounds();

      new google.maps.Marker({
        position: route.homeBase,
        map,
        label: "H",
        title: "Home base",
      });
      bounds.extend(route.homeBase);

      route.stops.forEach((stop) => {
        new google.maps.Marker({
          position: { lat: stop.lat, lng: stop.lng },
          map,
          label: String(stop.order),
          title: stop.clientName,
        });
        bounds.extend({ lat: stop.lat, lng: stop.lng });
      });

      map.fitBounds(bounds);

      if (route.stops.length > 0) {
        const directionsService = new google.maps.DirectionsService();
        const directionsRenderer = new google.maps.DirectionsRenderer({
          suppressMarkers: true,
          map,
        });

        const waypoints = route.stops.slice(0, -1).map((stop) => ({
          location: { lat: stop.lat, lng: stop.lng },
          stopover: true,
        }));
        const lastStop = route.stops[route.stops.length - 1];

        directionsService.route(
          {
            origin: route.homeBase,
            destination: { lat: lastStop.lat, lng: lastStop.lng },
            waypoints,
            travelMode: google.maps.TravelMode.DRIVING,
          },
          (result: any, status: string) => {
            if (status === "OK") {
              directionsRenderer.setDirections(result);
            }
          }
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [route]);

  if (error) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  return <div ref={mapRef} className="h-80 w-full rounded-lg border border-border" />;
}
