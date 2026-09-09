import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AirportExplorerData, GeoFeature } from "@/types/api";
import { Loader2, AlertCircle, MapPin, PlaneTakeoff, Building2, Car, Coffee, ChevronRight, RotateCcw, Layers, X } from "lucide-react";

interface AirportExplorerProps {
  data: AirportExplorerData | null;
  loading: boolean;
  error: string | null;
  latitude: number;
  longitude: number;
  iata: string;
}

type Category = "runways" | "terminals" | "gates" | "parking" | "transport" | "amenities";

const CATEGORY_CONFIG: Record<Category, { label: string; icon: React.ReactNode; color: string }> = {
  runways: { label: "Runways", icon: <PlaneTakeoff className="size-3" />, color: "#facc15" },
  terminals: { label: "Terminals", icon: <Building2 className="size-3" />, color: "#38bdf8" },
  gates: { label: "Gates", icon: <MapPin className="size-3" />, color: "#4ade80" },
  parking: { label: "Parking", icon: <Car className="size-3" />, color: "#c084fc" },
  transport: { label: "Transport", icon: <MapPin className="size-3" />, color: "#fb923c" },
  amenities: { label: "Amenities", icon: <Coffee className="size-3" />, color: "#f472b6" },
};

export function AirportExplorer({ data, loading, error, latitude, longitude, iata }: AirportExplorerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const airportMarkerRef = useRef<L.Marker | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<GeoFeature | null>(null);

  const getCategoryCount = useCallback((cat: Category): number => {
    if (!data) return 0;
    return data[cat]?.length ?? 0;
  }, [data]);

  // Initialize Leaflet map — independent of weather, depends only on container existing
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [latitude, longitude],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const icon = L.divIcon({
      className: "",
      html: `<div style="background:#38bdf8;color:#0f172a;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:9px;letter-spacing:0.5px;box-shadow:0 0 12px rgba(56,189,248,0.5);border:2px solid #fff;">${iata}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const marker = L.marker([latitude, longitude], { icon }).addTo(map);
    marker.bindTooltip(iata, { permanent: false, direction: "top" });

    mapRef.current = map;
    airportMarkerRef.current = marker;
    overlayGroupRef.current = L.layerGroup().addTo(map);
    setMapReady(true);

    // Keep Leaflet in sync with flex layout
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(mapContainerRef.current);
    // Initial invalidate after layout settles
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      airportMarkerRef.current = null;
      overlayGroupRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Re-center when coordinates change
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.setView([latitude, longitude], 13);
    airportMarkerRef.current?.setLatLng([latitude, longitude]);
  }, [latitude, longitude, mapReady]);

  // Show category overlays
  useEffect(() => {
    if (!mapReady || !mapRef.current || !overlayGroupRef.current || !data) return;
    const group = overlayGroupRef.current;
    group.clearLayers();

    if (!activeCategory) return;

    const features = data[activeCategory] ?? [];
    if (features.length === 0) return;

    const config = CATEGORY_CONFIG[activeCategory];
    const boundsPoints: L.LatLngExpression[] = [];

    for (const f of features) {
      const onClick = () => setSelectedFeature(f);

      if (f.geometry && f.geometry.length > 0 && f.geometry[0].length > 0) {
        // Backend geometry is [lat, lng] — Leaflet expects [lat, lng]
        const latLngs = (f.geometry[0] as unknown as number[][]).map(
          (c) => [c[0], c[1]] as L.LatLngExpression,
        );
        for (const ll of latLngs) boundsPoints.push(ll);

        if (latLngs.length >= 3) {
          L.polygon(latLngs as L.LatLngExpression[], {
            color: config.color,
            weight: 2,
            opacity: 0.8,
            fillColor: config.color,
            fillOpacity: 0.15,
          })
            .on("click", onClick)
            .addTo(group);
        } else if (latLngs.length >= 2) {
          L.polyline(latLngs as L.LatLngExpression[], {
            color: config.color,
            weight: activeCategory === "runways" ? 4 : 2,
            opacity: 0.9,
          })
            .on("click", onClick)
            .addTo(group);
        }
      } else {
        const ll: L.LatLngExpression = [f.latitude, f.longitude];
        boundsPoints.push(ll);
        L.circleMarker(ll, {
          radius: 5,
          color: "#fff",
          weight: 1,
          fillColor: config.color,
          fillOpacity: 0.9,
        })
          .on("click", onClick)
          .bindTooltip(f.name || f.ref || f.id, { direction: "top" })
          .addTo(group);
      }
    }

    if (boundsPoints.length > 0) {
      const bounds = L.latLngBounds(boundsPoints);
      if (bounds.isValid()) {
        mapRef.current!.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }
    }
  }, [activeCategory, data, mapReady]);

  // Focus on selected feature
  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedFeature) return;
    mapRef.current.setView([selectedFeature.latitude, selectedFeature.longitude], 16, { animate: true });
  }, [selectedFeature, mapReady]);

  const handleResetView = () => {
    setSelectedFeature(null);
    setActiveCategory(null);
    overlayGroupRef.current?.clearLayers();
    if (mapRef.current) {
      mapRef.current.setView([latitude, longitude], 13);
    }
  };

  const getAvailableCategories = (): Category[] => {
    if (!data) return [];
    return (Object.keys(CATEGORY_CONFIG) as Category[]).filter((cat) => getCategoryCount(cat) > 0);
  };

  if (loading) {
    return (
      <div className="glass-panel rounded-xl h-full min-h-[500px] flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel rounded-xl h-full min-h-[500px] flex flex-col items-center justify-center gap-2 p-6">
        <AlertCircle className="size-6 text-white/20" />
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Explorer unavailable</p>
        <p className="text-xs text-muted-foreground text-center">{error}</p>
      </div>
    );
  }

  const availableCategories = getAvailableCategories();
  const hasAnyData = availableCategories.length > 0;
  const activeFeatures = activeCategory ? (data?.[activeCategory] ?? []) : [];

  if (!loading && !error && data && !hasAnyData) {
    return (
      <div className="glass-panel rounded-xl h-full min-h-[500px] flex flex-col items-center justify-center gap-3 p-6">
        <Layers className="size-8 text-white/15" />
        <div className="text-center space-y-1.5">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">No mapped infrastructure</p>
          <p className="text-[11px] text-muted-foreground max-w-[280px] leading-relaxed">
            OpenStreetMap data is currently unavailable or incomplete for this airport.
          </p>
        </div>
        <button
          onClick={handleResetView}
          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-widest font-semibold text-muted-foreground hover:text-white hover:border-white/20 transition-colors"
        >
          <RotateCcw className="size-3" /> Reset View
        </button>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-xl overflow-hidden flex flex-col h-full">
      {/* Category tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/5 overflow-x-auto">
        <button
          onClick={handleResetView}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] uppercase tracking-widest font-semibold transition-colors shrink-0 ${
            !activeCategory ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-white hover:bg-white/5"
          }`}
        >
          <RotateCcw className="size-3" /> Overview
        </button>
        {availableCategories.map((cat) => {
          const config = CATEGORY_CONFIG[cat];
          const count = getCategoryCount(cat);
          return (
            <button
              key={cat}
              onClick={() => { setActiveCategory(activeCategory === cat ? null : cat); setSelectedFeature(null); }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] uppercase tracking-widest font-semibold transition-colors shrink-0 ${
                activeCategory === cat ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-white hover:bg-white/5"
              }`}
            >
              {config.icon} {config.label}
              <span className="text-[9px] font-mono opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Map — enlarged viewport: ~520px on desktop, responsive */}
      <div className="relative flex-1 min-h-[380px] sm:min-h-[450px] lg:min-h-[520px]">
        <div ref={mapContainerRef} className="h-full w-full min-h-[380px] sm:min-h-[450px] lg:min-h-[520px]" />
      </div>

      {/* Feature list / detail panel */}
      {activeCategory && (
        <div className="border-t border-white/5 max-h-[240px] overflow-y-auto">
          {selectedFeature ? (
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: CATEGORY_CONFIG[activeCategory].color }}>
                    {CATEGORY_CONFIG[activeCategory].label}
                  </span>
                  <ChevronRight className="size-3 text-muted-foreground" />
                  <span className="text-xs font-mono text-white truncate">
                    {selectedFeature.name || selectedFeature.ref || selectedFeature.id}
                  </span>
                </div>
                <button onClick={() => setSelectedFeature(null)} className="text-muted-foreground hover:text-white">
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {selectedFeature.ref && (
                  <div><span className="text-muted-foreground">Ref:</span> <span className="font-mono text-white">{selectedFeature.ref}</span></div>
                )}
                {selectedFeature.name && (
                  <div className="col-span-2"><span className="text-muted-foreground">Name:</span> <span className="text-white">{selectedFeature.name}</span></div>
                )}
                <div><span className="text-muted-foreground">Lat:</span> <span className="font-mono text-white">{selectedFeature.latitude.toFixed(4)}</span></div>
                <div><span className="text-muted-foreground">Lon:</span> <span className="font-mono text-white">{selectedFeature.longitude.toFixed(4)}</span></div>
                {Object.entries(selectedFeature.properties).slice(0, 4).map(([k, v]) => (
                  <div key={k} className="col-span-2"><span className="text-muted-foreground">{k}:</span> <span className="text-white">{v}</span></div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {activeFeatures.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4 font-mono">No data for this category</p>
              ) : (
                activeFeatures.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFeature(f)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover:bg-white/[0.04] transition-colors group"
                  >
                    <div className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_CONFIG[activeCategory].color }} />
                    <span className="text-xs font-mono text-white truncate flex-1">
                      {f.name || f.ref || `Feature ${f.id}`}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                      {f.latitude.toFixed(2)}, {f.longitude.toFixed(2)}
                    </span>
                    <ChevronRight className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {!activeCategory && (
        <div className="px-3 py-2 border-t border-white/5">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Layers className="size-3" /> Select a category above to explore airport infrastructure
          </div>
        </div>
      )}
    </div>
  );
}
