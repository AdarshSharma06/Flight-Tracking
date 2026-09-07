import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Plane } from "lucide-react";

function makePlaneIcon(heading?: number | null) {
  const rot = heading != null && !isNaN(heading) ? heading : 45;
  return L.divIcon({
    html: `<div style="background:#38bdf8;color:#0f172a;border-radius:9999px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 16px rgba(56,189,248,0.55);transform:rotate(${rot}deg);font-size:14px;line-height:1;">✈</div>`,
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

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
  heading?: number | null;
  className?: string;
}

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    // Fix Leaflet 0-height on flex/container resize
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 400);
    const t3 = setTimeout(() => map.invalidateSize(), 900);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener("resize", onResize);
    };
  }, [map]);
  return null;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    // Ensure map has size before fitting
    setTimeout(() => map.invalidateSize(), 50);
    if (points.length === 1) {
      map.setView(points[0], 8, { animate: true });
    } else {
      map.fitBounds(points, { padding: [60, 60], animate: true });
    }
  }, [map, points]);
  return null;
}

export function TrackingMap({ live, departure, arrival, altitude, speed, heading, className }: TrackingMapProps) {
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
    <div className={`w-full h-full relative bg-black ${className ?? ""}`} style={{ minHeight: 320 }}>
      <MapContainer center={center} zoom={4} scrollWheelZoom={true} className="h-full w-full bg-black z-0" zoomControl={true} style={{ height: "100%", width: "100%" }}>
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
          <Marker position={[live.lat, live.lng]} icon={makePlaneIcon(heading)}>
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
        <InvalidateSize />
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
