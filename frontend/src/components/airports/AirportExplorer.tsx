import { useEffect, useRef, useState, useCallback } from "react";
import { Map as MapLibreMap, Marker, NavigationControl, LngLatBounds, setWorkerUrl } from "maplibre-gl";
import type { MapMouseEvent, MapGeoJSONFeature, ErrorEvent } from "maplibre-gl";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Vite ?worker&url import
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { AirportExplorerData, GeoFeature } from "@/types/api";

setWorkerUrl(workerUrl as string);
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

function featuresToGeoJSON(features: GeoFeature[]): GeoJSON.FeatureCollection {
  const out: GeoJSON.Feature[] = [];
  for (const f of features) {
    if (f.geometry && f.geometry.length > 0 && f.geometry[0].length > 0) {
      const coords = f.geometry[0] as unknown as number[][];
      const lngLatCoords = coords.map((c) => [c[1], c[0]]);

      if (lngLatCoords.length >= 3) {
        out.push({
          type: "Feature",
          properties: { id: f.id, name: f.name, ref: f.ref, category: f.category, ...f.properties },
          geometry: { type: "Polygon", coordinates: [lngLatCoords] },
        });
      } else if (lngLatCoords.length >= 2) {
        out.push({
          type: "Feature",
          properties: { id: f.id, name: f.name, ref: f.ref, category: f.category, ...f.properties },
          geometry: { type: "LineString", coordinates: lngLatCoords },
        });
      }
    } else {
      out.push({
        type: "Feature",
        properties: { id: f.id, name: f.name, ref: f.ref, category: f.category, ...f.properties },
        geometry: { type: "Point", coordinates: [f.longitude, f.latitude] },
      });
    }
  }
  return { type: "FeatureCollection", features: out };
}

export function AirportExplorer({ data, loading, error, latitude, longitude, iata }: AirportExplorerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const overlaySourceIdsRef = useRef<string[]>([]);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mapLoadTicks, setMapLoadTicks] = useState(0);
  const [mapRetryKey, setMapRetryKey] = useState(0);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<GeoFeature | null>(null);

  // Tick every second while map is loading so UI shows elapsed time
  useEffect(() => {
    if (mapStatus !== "loading") return;
    const id = setInterval(() => setMapLoadTicks((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [mapStatus]);

  const getCategoryCount = useCallback((cat: Category): number => {
    if (!data) return 0;
    return data[cat]?.length ?? 0;
  }, [data]);

  // Initialize MapLibre map — depends on `loading` so it re-runs when the container becomes available
  useEffect(() => {
    // Container doesn't exist while parent API is loading (early return in render)
    if (!mapContainerRef.current) return;

    let cancelled = false;
    let map: MapLibreMap | null = null;
    let loadTimeout: ReturnType<typeof setTimeout> | null = null;

    const onLoad = () => {
      if (cancelled) return;
      if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
      mapRef.current = map;
      markerRef.current = marker;
      console.log("[AirportExplorer] MapLibre map loaded for", iata);
      setMapStatus("ready");
    };

    const onError = (e: ErrorEvent) => {
      console.error("[AirportExplorer] MapLibre error:", e.error?.message ?? e);
      if (!cancelled) setMapStatus("error");
    };

    const markerEl = document.createElement("div");
    markerEl.style.cssText = "display:flex;align-items:center;justify-content:center;";
    markerEl.innerHTML = `<div style="background:#38bdf8;color:#0f172a;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:9px;letter-spacing:0.5px;box-shadow:0 0 12px rgba(56,189,248,0.5);border:2px solid #fff;">${iata}</div>`;

    const marker = new Marker({ element: markerEl })
      .setLngLat([longitude, latitude]);

    try {
      console.log("[AirportExplorer] Creating MapLibre map for", iata);
      map = new MapLibreMap({
        container: mapContainerRef.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [longitude, latitude],
        zoom: 13,
        pitchWithRotate: false,
        dragRotate: false,
        touchZoomRotate: false,
        maxPitch: 0,
      });

      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      marker.addTo(map);

      map.on("load", onLoad);
      map.on("error", onError);

      // Safety timeout: if map never fires "load" within 15s, show error
      loadTimeout = setTimeout(() => {
        if (cancelled) return;
        if (mapRef.current) return;
        console.warn("[AirportExplorer] MapLibre load timed out after 15s");
        setMapStatus("error");
      }, 15000);
    } catch (err) {
      console.error("[AirportExplorer] MapLibre init failed:", err);
      if (!cancelled) setMapStatus("error");
    }

    return () => {
      cancelled = true;
      if (loadTimeout) clearTimeout(loadTimeout);
      marker.remove();
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, mapRetryKey]);

  // Re-center when coordinates change
  useEffect(() => {
    if (mapStatus !== "ready" || !mapRef.current) return;
    mapRef.current.flyTo({ center: [longitude, latitude], zoom: 13, duration: 500 });
    markerRef.current?.setLngLat([longitude, latitude]);
  }, [latitude, longitude, mapStatus]);

  // Show category overlays on map
  useEffect(() => {
    if (mapStatus !== "ready" || !mapRef.current || !data) return;
    const map = mapRef.current;

    // Clear previous overlays
    for (const sid of overlaySourceIdsRef.current) {
      if (map.getLayer(`overlay-fill-${sid}`)) map.removeLayer(`overlay-fill-${sid}`);
      if (map.getLayer(`overlay-outline-${sid}`)) map.removeLayer(`overlay-outline-${sid}`);
      if (map.getLayer(`overlay-line-${sid}`)) map.removeLayer(`overlay-line-${sid}`);
      if (map.getLayer(`overlay-point-${sid}`)) map.removeLayer(`overlay-point-${sid}`);
      if (map.getSource(sid)) map.removeSource(sid);
    }
    overlaySourceIdsRef.current = [];

    if (!activeCategory) return;

    const features = data[activeCategory] ?? [];
    if (features.length === 0) return;

    const config = CATEGORY_CONFIG[activeCategory];
    const geojson = featuresToGeoJSON(features);
    const sourceId = `overlay-${activeCategory}`;

    map.addSource(sourceId, { type: "geojson", data: geojson });
    overlaySourceIdsRef.current.push(sourceId);

    const hasPolygons = geojson.features.some((f) => f.geometry.type === "Polygon");
    const hasLines = geojson.features.some((f) => f.geometry.type === "LineString");
    const hasPoints = geojson.features.some((f) => f.geometry.type === "Point");

    if (hasPolygons) {
      map.addLayer({
        id: `overlay-fill-${sourceId}`,
        type: "fill",
        source: sourceId,
        filter: ["==", "$type", "Polygon"],
        paint: { "fill-color": config.color, "fill-opacity": 0.15 },
      });
      map.addLayer({
        id: `overlay-outline-${sourceId}`,
        type: "line",
        source: sourceId,
        filter: ["==", "$type", "Polygon"],
        paint: { "line-color": config.color, "line-width": 2, "line-opacity": 0.8 },
      });
    }

    if (hasLines) {
      map.addLayer({
        id: `overlay-line-${sourceId}`,
        type: "line",
        source: sourceId,
        filter: ["==", "$type", "LineString"],
        paint: {
          "line-color": config.color,
          "line-width": activeCategory === "runways" ? 4 : 2,
          "line-opacity": 0.9,
        },
      });
    }

    if (hasPoints) {
      map.addLayer({
        id: `overlay-point-${sourceId}`,
        type: "circle",
        source: sourceId,
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 5,
          "circle-color": config.color,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1,
          "circle-opacity": 0.8,
        },
      });
    }

    // Fit bounds to features
    const bounds = new LngLatBounds();
    let hasBounds = false;
    for (const f of features) {
      if (f.geometry?.[0]?.length) {
        for (const c of f.geometry[0]) {
          bounds.extend([c[1], c[0]]);
          hasBounds = true;
        }
      } else {
        bounds.extend([f.longitude, f.latitude]);
        hasBounds = true;
      }
    }
    if (hasBounds) {
      map.fitBounds(bounds, { padding: 40, maxZoom: 16 });
    }
  }, [activeCategory, data, mapStatus]);

  // Click interaction on overlay features
  useEffect(() => {
    if (mapStatus !== "ready" || !mapRef.current) return;
    const map = mapRef.current;

    const onClick = (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const props = feat.properties as Record<string, unknown>;

      // Find matching GeoFeature from data
      if (activeCategory && data) {
        const features = data[activeCategory] ?? [];
        const match = features.find((f) => f.id === props.id);
        if (match) {
          setSelectedFeature(match);
        }
      }
    };

    // Attach to all overlay layers
    const layerIds: string[] = [];
    for (const sid of overlaySourceIdsRef.current) {
      for (const suffix of ["overlay-fill", "overlay-outline", "overlay-line", "overlay-point"]) {
        const lid = `${suffix}-${sid}`;
        if (map.getLayer(lid)) {
          map.on("click", lid, onClick);
          layerIds.push(lid);
        }
      }
    }

    // Change cursor on hover
    const onEnter = () => { map.getCanvas().style.cursor = "pointer"; };
    const onLeave = () => { map.getCanvas().style.cursor = ""; };
    for (const lid of layerIds) {
      map.on("mouseenter", lid, onEnter);
      map.on("mouseleave", lid, onLeave);
    }

    return () => {
      for (const lid of layerIds) {
        map.off("click", lid, onClick);
        map.off("mouseenter", lid, onEnter);
        map.off("mouseleave", lid, onLeave);
      }
    };
  }, [mapStatus, activeCategory, data]);

  // Focus on selected feature
  useEffect(() => {
    if (mapStatus !== "ready" || !mapRef.current || !selectedFeature) return;
    mapRef.current.flyTo({
      center: [selectedFeature.longitude, selectedFeature.latitude],
      zoom: 16,
      duration: 500,
    });
  }, [selectedFeature, mapStatus]);

  const handleResetView = () => {
    setSelectedFeature(null);
    setActiveCategory(null);
    if (mapRef.current) {
      for (const sid of overlaySourceIdsRef.current) {
        for (const suffix of ["overlay-fill", "overlay-outline", "overlay-line", "overlay-point"]) {
          const lid = `${suffix}-${sid}`;
          if (mapRef.current.getLayer(lid)) mapRef.current.removeLayer(lid);
        }
        if (mapRef.current.getSource(sid)) mapRef.current.removeSource(sid);
      }
      overlaySourceIdsRef.current = [];
      mapRef.current.flyTo({ center: [longitude, latitude], zoom: 13, duration: 500 });
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
            <div className="text-center space-y-3">
              <Loader2 className="size-5 animate-spin text-primary mx-auto" />
              <p className="text-[10px] text-muted-foreground font-mono">Loading map...{mapLoadTicks > 0 ? ` ${mapLoadTicks}s` : ""}</p>
              {mapLoadTicks >= 5 && (
                <p className="text-[10px] text-muted-foreground/50">Taking longer than usual</p>
              )}
            </div>
          </div>
        )}
        {mapStatus === "error" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0f1a]">
            <div className="text-center space-y-2">
              <AlertCircle className="size-5 text-white/30 mx-auto" />
              <p className="text-xs text-muted-foreground">Map failed to load</p>
              <p className="text-[10px] text-muted-foreground/60 max-w-[260px]">
                OpenFreeMap could not be loaded. The airport infrastructure data is available, but the basemap is unavailable.
              </p>
              <button
                onClick={() => { setMapStatus("loading"); setMapLoadTicks(0); setMapRetryKey((k) => k + 1); }}
                className="mt-1 text-[10px] text-primary hover:underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        <div ref={mapContainerRef} className="h-full w-full" />
        <div className="absolute bottom-1 right-2 z-20 pointer-events-none">
          <span className="text-[9px] text-white/30 font-mono">
            &copy; OpenFreeMap &copy; OpenStreetMap contributors
          </span>
        </div>
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
