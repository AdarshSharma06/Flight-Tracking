import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

interface AirportMapProps {
  latitude: number;
  longitude: number;
  label?: string;
  className?: string;
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

interface GoogleMapsWindow {
  google?: {
    maps?: {
      Map: new (el: HTMLElement, opts: Record<string, unknown>) => Record<string, unknown>;
      LatLng: new (lat: number, lng: number) => unknown;
      Marker: new (opts: Record<string, unknown>) => Record<string, unknown>;
      Animation: { DROP: unknown };
    };
  };
  initGoogleMap?: () => void;
}

export function AirportMap({ latitude, longitude, label, className = "" }: AirportMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!GOOGLE_MAPS_API_KEY) {
      setError(true);
      setLoading(false);
      return;
    }

    const w = window as unknown as GoogleMapsWindow;
    if (w.google?.maps) {
      initMap();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=initGoogleMap`;
    script.async = true;
    script.defer = true;
    w.initGoogleMap = () => {
      initMap();
    };
    script.onerror = () => {
      setError(true);
      setLoading(false);
    };
    document.head.appendChild(script);

    return () => { /* cleanup */ };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mapInstanceRef.current) {
      const w = window as unknown as GoogleMapsWindow;
      const maps = w.google?.maps;
      if (maps) {
        const center = new maps.LatLng(latitude, longitude);
        mapInstanceRef.current.setCenter(center);
        if (markerRef.current) {
          markerRef.current.setPosition(center);
        }
      }
    }
  }, [latitude, longitude]);

  function initMap() {
    if (!mapRef.current) {
      setError(true);
      setLoading(false);
      return;
    }
    const w = window as unknown as GoogleMapsWindow;
    const maps = w.google?.maps;
    if (!maps) {
      setError(true);
      setLoading(false);
      return;
    }

    try {
      const center = new maps.LatLng(latitude, longitude);
      const map = new maps.Map(mapRef.current, {
        center,
        zoom: 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#0d1117" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#8b949e" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#0d1117" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1117" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#161b22" }] },
          { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8b949e" }] },
          { featureType: "poi", elementType: "geometry", stylers: [{ color: "#161b22" }] },
          { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#8b949e" }] },
          { featureType: "transit", elementType: "geometry", stylers: [{ color: "#161b22" }] },
          { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#161b22" }] },
          { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#0d1117" }] },
        ],
      });

      const marker = new maps.Marker({
        position: center,
        map,
        title: label ?? "Airport",
        animation: maps.Animation.DROP,
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-white/[0.02] p-6 text-center ${className}`}>
        <AlertCircle className="size-6 text-white/20" />
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Map unavailable</p>
        <p className="text-xs text-muted-foreground">Google Maps API key not configured</p>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0f1a]">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      )}
      <div ref={mapRef} className="h-full w-full" />
    </div>
  );
}
