import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MapPin, Plane } from "lucide-react";

// Fix default marker icons (leaflet asset path issue in Vite)
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

const planeIcon = L.divIcon({
  html: '<div style="background:#7c3aed;color:white;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;">✈</div>',
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export interface MapPoint {
  lat: number;
  lng: number;
  label: string;
  subLabel?: string;
}

interface TrackingMapProps {
  live?: MapPoint | null;
  departure?: MapPoint | null;
  arrival?: MapPoint | null;
  // optional altitude etc. for popup
  altitude?: number | null;
  speed?: number | null;
  className?: string;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 8);
    } else {
      map.fitBounds(points, { padding: [40, 40] });
    }
  }, [map, points]);
  return null;
}

export function TrackingMap({ live, departure, arrival, altitude, speed, className }: TrackingMapProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const hasAny = !!live || !!departure || !!arrival;

  if (!mounted) {
    return (
      <div className={`rounded-xl border bg-muted/20 flex items-center justify-center min-h-[380px] ${className ?? ""}`}>
        <p className="text-sm text-muted-foreground">Loading map…</p>
      </div>
    );
  }

  if (!hasAny) {
    return (
      <div className={`rounded-xl border bg-card flex flex-col min-h-[380px] ${className ?? ""}`}>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center">
            <MapPin className="size-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">No position to display</p>
            <p className="text-xs text-muted-foreground max-w-[32ch]">Select a flight to see its route. Live position appears only when the backend returns latitude/longitude (AviationStack free tier often has no live data).</p>
          </div>
        </div>
        <div className="p-3 border-t bg-muted/30 rounded-b-xl">
          <p className="text-xs text-muted-foreground text-center">Map uses OpenStreetMap via Leaflet • No API key required • Integration point: <code className="bg-background px-1 rounded border">src/components/tracking/TrackingMap.tsx</code></p>
        </div>
      </div>
    );
  }

  const points: [number, number][] = [];
  if (departure) points.push([departure.lat, departure.lng]);
  if (live) points.push([live.lat, live.lng]);
  if (arrival) points.push([arrival.lat, arrival.lng]);

  // Default center: live > departure > 0,0
  const center: [number, number] = live ? [live.lat, live.lng] : departure ? [departure.lat, departure.lng] : arrival ? [arrival.lat, arrival.lng] : [20, 0];

  const line: [number, number][] = [];
  if (departure) line.push([departure.lat, departure.lng]);
  if (live) line.push([live.lat, live.lng]);
  if (arrival) line.push([arrival.lat, arrival.lng]);

  return (
    <div className={`rounded-xl border overflow-hidden flex flex-col bg-card ${className ?? ""}`}>
      <div className="h-[420px] w-full relative">
        <MapContainer center={center} zoom={4} scrollWheelZoom className="h-full w-full" style={{ background: "#e5e7eb" }}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {departure && (
            <Marker position={[departure.lat, departure.lng]}>
              <Popup>
                <strong>{departure.label}</strong>
                {departure.subLabel && <><br />{departure.subLabel}</>}
                <br />
                {departure.lat.toFixed(3)}, {departure.lng.toFixed(3)}
              </Popup>
            </Marker>
          )}
          {arrival && (
            <Marker position={[arrival.lat, arrival.lng]}>
              <Popup>
                <strong>{arrival.label}</strong>
                {arrival.subLabel && <><br />{arrival.subLabel}</>}
                <br />
                {arrival.lat.toFixed(3)}, {arrival.lng.toFixed(3)}
              </Popup>
            </Marker>
          )}
          {live && (
            <Marker position={[live.lat, live.lng]} icon={planeIcon}>
              <Popup>
                <div className="flex items-center gap-1.5 font-semibold"><Plane className="size-3.5" /> {live.label}</div>
                {live.subLabel && <div className="text-xs">{live.subLabel}</div>}
                <div className="text-xs">Lat {live.lat.toFixed(4)} • Lng {live.lng.toFixed(4)}</div>
                {altitude != null && <div className="text-xs">Alt {altitude} m</div>}
                {speed != null && <div className="text-xs">Speed {speed} km/h</div>}
              </Popup>
            </Marker>
          )}
          {line.length >= 2 && <Polyline positions={line} color="#7c3aed" weight={3} opacity={0.7} dashArray={live ? undefined : "6 6"} />}
          <FitBounds points={points} />
        </MapContainer>
      </div>
      {!live && (departure || arrival) && (
        <Alert className="rounded-none border-0 border-t">
          <MapPin className="size-4" />
          <AlertTitle className="text-xs">Live position unavailable</AlertTitle>
          <AlertDescription className="text-xs">The backend returned no latitude/longitude for this flight. Route is shown with known airport locations only.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
