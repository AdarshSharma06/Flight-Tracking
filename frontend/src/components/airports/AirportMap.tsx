import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

interface AirportMapProps {
  latitude: number;
  longitude: number;
  label?: string;
  className?: string;
}

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

let mapsLoaded = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedMap: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedMarker: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedMaps: any = null;

export function AirportMap({ latitude, longitude, label, className = "" }: AirportMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (!mapRef.current) return;

    if (!API_KEY) {
      setStatus("error");
      setErrorMsg("Google Maps API key not configured (VITE_GOOGLE_MAPS_API_KEY)");
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        if (!mapsLoaded) {
          setOptions({
            key: API_KEY,
            v: "weekly",
          });
          // Load the core + marker libraries
          const [mapsLib] = await Promise.all([
            importLibrary("maps"),
            importLibrary("marker"),
          ]);
          if (cancelled) return;
          cachedMaps = mapsLib;
          mapsLoaded = true;
        }

        if (!mapRef.current || cancelled) return;

        const center = new cachedMaps.LatLng(latitude, longitude);

        // Destroy previous map if navigating between airports
        if (cachedMap) {
          cachedMap = null;
          cachedMarker = null;
        }

        const map = new cachedMaps.Map(mapRef.current, {
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const marker = new (window as any).google.maps.Marker({
          position: center,
          map,
          title: label ?? "Airport",
          animation: cachedMaps.Animation?.DROP,
        });

        if (!cancelled) {
          cachedMap = map;
          cachedMarker = marker;
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[AirportMap] Google Maps initialization failed:", err);
          setStatus("error");
          setErrorMsg(err instanceof Error ? err.message : "Failed to load Google Maps");
        }
      }
    }

    init();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-center map when coordinates change
  useEffect(() => {
    if (status !== "ready" || !cachedMap || !cachedMaps) return;

    const center = new cachedMaps.LatLng(latitude, longitude);
    cachedMap.setCenter(center);
    if (cachedMarker) {
      cachedMarker.setPosition(center);
    }
  }, [latitude, longitude, status]);

  if (status === "error") {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-white/[0.02] p-6 text-center ${className}`}>
        <AlertCircle className="size-6 text-white/20" />
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Map unavailable</p>
        <p className="text-xs text-muted-foreground">{errorMsg || "Could not load Google Maps"}</p>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {status === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0f1a]">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      )}
      <div ref={mapRef} className="h-full w-full" />
    </div>
  );
}
