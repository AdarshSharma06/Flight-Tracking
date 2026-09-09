import { useEffect, useRef, useState, useCallback } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let explorerCachedLibs: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let explorerGoogle: any = null;

export function AirportExplorer({ data, loading, error, latitude, longitude, iata }: AirportExplorerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlaysRef = useRef<any[]>([]);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<GeoFeature | null>(null);

  const getCategoryCount = useCallback((cat: Category): number => {
    if (!data) return 0;
    return data[cat]?.length ?? 0;
  }, [data]);

  // Initialize Google Map
  useEffect(() => {
    if (!mapRef.current) return;
    const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";
    if (!API_KEY) {
      setMapStatus("error");
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        if (!explorerCachedLibs) {
          setOptions({ key: API_KEY, v: "weekly" });
          const [mapsLib, markerLib] = await Promise.all([
            importLibrary("maps"),
            importLibrary("marker"),
          ]);
          if (cancelled) return;
          explorerGoogle = (window as any).google;
          explorerCachedLibs = {
            Map: mapsLib.Map,
            AdvancedMarkerElement: markerLib.AdvancedMarkerElement,
          };
        }

        if (!mapRef.current || cancelled) return;

        const map = new explorerCachedLibs.Map(mapRef.current, {
          center: { lat: latitude, lng: longitude },
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

        const pin = document.createElement("div");
        pin.style.cssText = "display:flex;align-items:center;justify-content:center;";
        pin.innerHTML = `<div style="background:#38bdf8;color:#0f172a;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:9px;letter-spacing:0.5px;box-shadow:0 0 12px rgba(56,189,248,0.5);border:2px solid #fff;">${iata}</div>`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new explorerCachedLibs.AdvancedMarkerElement({
          position: { lat: latitude, lng: longitude },
          map,
          title: iata,
          content: pin,
        });

        if (!cancelled) {
          mapInstanceRef.current = map;
          setMapStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[AirportExplorer] Map init failed:", err);
          setMapStatus("error");
        }
      }
    }

    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-center when coordinates change
  useEffect(() => {
    if (mapStatus !== "ready" || !mapInstanceRef.current) return;
    mapInstanceRef.current.setCenter({ lat: latitude, lng: longitude });
  }, [latitude, longitude, mapStatus]);

  // Clear overlays
  const clearOverlays = useCallback(() => {
    overlaysRef.current.forEach((o) => { o.setMap(null); });
    overlaysRef.current = [];
  }, []);

  // Show category overlays on map
  useEffect(() => {
    if (mapStatus !== "ready" || !mapInstanceRef.current || !data) return;
    clearOverlays();

    if (!activeCategory) return;

    const features = data[activeCategory] ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gmap = mapInstanceRef.current as any;
    const config = CATEGORY_CONFIG[activeCategory];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newOverlays: any[] = [];

    const gmaps = explorerGoogle?.maps;
    if (!gmaps) return;

    for (const f of features) {
      if (f.geometry && f.geometry.length > 0 && f.geometry[0].length > 0) {
        const path = f.geometry[0].map((c) => ({ lat: c[0], lng: c[1] }));

        if (path.length >= 3) {
          // Polygon (terminal, building, parking)
          const polygon = new gmaps.Polygon({
            paths: path,
            strokeColor: config.color,
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: config.color,
            fillOpacity: 0.15,
            map: gmap,
          });
          newOverlays.push(polygon);
        } else if (path.length === 2) {
          // Polyline (runway, taxiway)
          const polyline = new gmaps.Polyline({
            path,
            strokeColor: config.color,
            strokeOpacity: 0.9,
            strokeWeight: activeCategory === "runways" ? 4 : 2,
            map: gmap,
          });
          newOverlays.push(polyline);
        }
      } else {
        // Point marker
        const marker = new gmaps.Marker({
          position: { lat: f.latitude, lng: f.longitude },
          map: gmap,
          title: f.name || f.ref || f.id,
        });
        newOverlays.push(marker);
      }
    }

    overlaysRef.current = newOverlays;

    // Fit bounds to show all features
    if (features.length > 0 && explorerGoogle?.maps) {
      const bounds = new explorerGoogle.maps.LatLngBounds();
      for (const f of features) {
        if (f.geometry?.[0]?.length) {
          for (const c of f.geometry[0]) {
            bounds.extend({ lat: c[0], lng: c[1] });
          }
        } else {
          bounds.extend({ lat: f.latitude, lng: f.longitude });
        }
      }
      gmap.fitBounds(bounds, 40);
    }
  }, [activeCategory, data, mapStatus, clearOverlays]);

  // Focus on selected feature
  useEffect(() => {
    if (mapStatus !== "ready" || !mapInstanceRef.current || !selectedFeature) return;
    const gmap = mapInstanceRef.current;
    gmap.setCenter({ lat: selectedFeature.latitude, lng: selectedFeature.longitude });
    gmap.setZoom(16);
  }, [selectedFeature, mapStatus]);

  const handleResetView = () => {
    setSelectedFeature(null);
    setActiveCategory(null);
    clearOverlays();
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setCenter({ lat: latitude, lng: longitude });
      mapInstanceRef.current.setZoom(13);
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

      {/* Map */}
      <div className="relative flex-1 min-h-[300px]">
        {mapStatus === "loading" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0f1a]">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        )}
        {mapStatus === "error" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0f1a]">
            <p className="text-xs text-muted-foreground">Map unavailable</p>
          </div>
        )}
        <div ref={mapRef} className="h-full w-full" />
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
