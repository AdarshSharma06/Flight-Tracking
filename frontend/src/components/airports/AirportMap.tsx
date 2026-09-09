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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedMap: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedMarker: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedLibs: { Map: any; AdvancedMarkerElement: any } | null = null;

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
        if (!cachedLibs) {
          setOptions({
            key: API_KEY,
            v: "weekly",
          });
          const [mapsLib, markerLib] = await Promise.all([
            importLibrary("maps"),
            importLibrary("marker"),
          ]);
          if (cancelled) return;
          cachedLibs = {
            Map: mapsLib.Map,
            AdvancedMarkerElement: markerLib.AdvancedMarkerElement,
          };
        }

        if (!mapRef.current || cancelled) return;

        const center = { lat: latitude, lng: longitude };

        // Destroy previous map if navigating between airports
        if (cachedMap) {
          cachedMap = null;
          cachedMarker = null;
        }

        const map = new cachedLibs.Map(mapRef.current, {
          center,
          zoom: 13,
          mapId: "DEMO_MAP_ID",
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

        const iata = label?.split(" — ")[0] ?? "";
        const pin = document.createElement("div");
        pin.style.cssText = "display:flex;align-items:center;justify-content:center;";
        pin.innerHTML = `<div style="background:#38bdf8;color:#0f172a;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:9px;letter-spacing:0.5px;box-shadow:0 0 12px rgba(56,189,248,0.5);border:2px solid #fff;">${iata}</div>`;

        const marker = new cachedLibs.AdvancedMarkerElement({
          position: center,
          map,
          title: label ?? "Airport",
          content: pin,
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
    if (status !== "ready" || !cachedMap) return;

    const center = { lat: latitude, lng: longitude };
    cachedMap.setCenter(center);
    if (cachedMarker) {
      cachedMarker.position = center;
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
