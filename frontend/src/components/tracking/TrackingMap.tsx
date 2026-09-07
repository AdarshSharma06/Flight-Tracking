import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Plane } from "lucide-react";

const planeIcon = L.divIcon({
  html: '<div style="background:#38bdf8;color:#0f172a;border-radius:9999px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 15px rgba(56,189,248,0.5);transform:rotate(45deg);">✈</div>',
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const dotIcon = L.divIcon({
  html: '<div style="background:white;border:3px solid #38bdf8;border-radius:9999px;width:16px;height:16px;"></div>',
  className: "",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
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
      map.fitBounds(points, { padding: [60, 60] });
    }
  }, [map, points]);
  return null;
}

export function TrackingMap({ live, departure, arrival, altitude, speed, className }: TrackingMapProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className={`w-full h-full bg-black flex items-center justify-center ${className ?? ""}`}>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Initializing Cartography...</p>
      </div>
    );
  }

  const points: [number, number][] = [];
  if (departure) points.push([departure.lat, departure.lng]);
  if (live) points.push([live.lat, live.lng]);
  if (arrival) points.push([arrival.lat, arrival.lng]);

  const center: [number, number] = live ? [live.lat, live.lng] : departure ? [departure.lat, departure.lng] : arrival ? [arrival.lat, arrival.lng] : [20, 0];

  const line: [number, number][] = [];
  if (departure) line.push([departure.lat, departure.lng]);
  if (live) line.push([live.lat, live.lng]);
  if (arrival) line.push([arrival.lat, arrival.lng]);

  return (
    <div className={`w-full h-full relative bg-black ${className ?? ""}`}>
      <MapContainer center={center} zoom={4} scrollWheelZoom={false} className="h-full w-full bg-black z-0" zoomControl={false}>
        <TileLayer 
          attribution='&copy; <a href="https://carto.com/">Carto</a>' 
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png" 
        />
        {departure && (
          <Marker position={[departure.lat, departure.lng]} icon={dotIcon}>
            <Popup className="custom-popup">
              <div className="font-mono text-xs">
                <strong className="block text-primary uppercase">{departure.label}</strong>
                <span className="text-muted-foreground">{departure.subLabel}</span>
              </div>
            </Popup>
          </Marker>
        )}
        {arrival && (
          <Marker position={[arrival.lat, arrival.lng]} icon={dotIcon}>
            <Popup className="custom-popup">
              <div className="font-mono text-xs">
                <strong className="block text-primary uppercase">{arrival.label}</strong>
                <span className="text-muted-foreground">{arrival.subLabel}</span>
              </div>
            </Popup>
          </Marker>
        )}
        {live && (
          <Marker position={[live.lat, live.lng]} icon={planeIcon}>
            <Popup className="custom-popup">
              <div className="font-mono text-xs space-y-1">
                <strong className="block text-primary uppercase flex items-center gap-1">
                  <Plane className="size-3" /> {live.label}
                </strong>
                {altitude != null && <div className="text-muted-foreground">ALT: {altitude}m</div>}
                {speed != null && <div className="text-muted-foreground">SPD: {speed}km/h</div>}
              </div>
            </Popup>
          </Marker>
        )}
        {line.length >= 2 && <Polyline positions={line} color="#38bdf8" weight={2} opacity={0.6} dashArray={live ? undefined : "4 8"} />}
        <FitBounds points={points} />
      </MapContainer>
      
      {/* Map Overlay Vignette */}
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] z-10" />
      
      {!live && (departure || arrival) && (
        <div className="absolute bottom-6 right-6 z-20 glass-panel px-3 py-2 rounded-md flex items-center gap-2">
          <div className="size-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-[10px] uppercase tracking-widest font-mono text-amber-500 font-semibold">Live Position Offline</span>
        </div>
      )}
    </div>
  );
}
