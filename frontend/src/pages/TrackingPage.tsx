import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { flightService } from "@/services/flight.service";
import { weatherService } from "@/services/weather.service";
import type { FlightDto, FlightTrackingDto, WeatherDto } from "@/types/api";
import { TrackingMap } from "@/components/tracking/TrackingMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Plane, Navigation, Thermometer, Wind, Target } from "lucide-react";

export function TrackingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [flightIata, setFlightIata] = useState(searchParams.get("flight_iata") ?? "");
  
  const [results, setResults] = useState<FlightDto[] | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const [selected, setSelected] = useState<FlightDto | null>(null);
  const [detail, setDetail] = useState<FlightDto | null>(null);
  const [tracking, setTracking] = useState<FlightTrackingDto | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [weather, setWeather] = useState<WeatherDto | null>(null);

  const doSearch = async (q?: string) => {
    const query = q ?? flightIata.trim();
    if (!query) return;
    setLoadingSearch(true);
    setResults(null);
    try {
      const res = await flightService.search({ flight_iata: query, limit: 10 });
      setResults(res.flights);
      setSearchParams(new URLSearchParams({ flight_iata: query }), { replace: true });
      if (res.flights.length > 0) {
        handleSelect(res.flights[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSearch(false);
    }
  };

  useEffect(() => {
    const q = searchParams.get("flight_iata");
    if (q && !results && !loadingSearch) {
      setFlightIata(q);
      doSearch(q);
    }
  }, []);

  const handleSelect = async (f: FlightDto) => {
    setSelected(f);
    setLoadingDetail(true);
    setWeather(null);
    const flightNumber = f.flightIata ?? f.flightNumber ?? "";
    if (!flightNumber) { setLoadingDetail(false); return; }
    try {
      const [d, t] = await Promise.all([
        flightService.getByFlightNumber(flightNumber).catch(() => null),
        flightService.getTracking(flightNumber).catch(() => null),
      ]);
      setDetail(d ?? f);
      setTracking(t);
      if (t?.latitude && t?.longitude) {
        weatherService.getByCoordinates(t.latitude, t.longitude).then(setWeather).catch(() => {});
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const displayFlight = detail ?? selected;
  const livePoint = tracking?.latitude && tracking?.longitude ? { lat: tracking.latitude, lng: tracking.longitude, label: tracking.flightIata ?? "Aircraft" } : null;

  return (
    <div className="w-full flex-1 flex flex-col lg:flex-row h-[100dvh] pt-20 overflow-hidden relative bg-background">
      {/* LEFT 60% Details */}
      <div className="w-full lg:w-[60%] flex flex-col h-full bg-background border-r border-white/5 relative z-10 shadow-2xl">
        <div className="p-6 border-b border-white/5 shrink-0 flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={flightIata}
              onChange={(e) => setFlightIata(e.target.value)}
              placeholder="Search Flight IATA (e.g., LH400)"
              className="pl-9 bg-muted/20 border-white/10 font-mono text-sm uppercase h-10"
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            />
          </div>
          <Button onClick={() => doSearch()} disabled={loadingSearch} className="font-semibold text-xs tracking-wider uppercase h-10 px-6">
            {loadingSearch ? <Loader2 className="size-4 animate-spin" /> : "Track"}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
          {!displayFlight && !loadingDetail && !loadingSearch && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
              <Target className="size-12 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-mono text-sm uppercase tracking-widest">Awaiting Input</p>
                <p className="text-xs text-muted-foreground max-w-[30ch]">Enter a flight identifier to acquire live telemetry and operational data.</p>
              </div>
            </div>
          )}

          {loadingDetail && (
            <div className="h-full flex items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div>
          )}

          {displayFlight && !loadingDetail && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
              
              {/* Identity Header */}
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-label text-primary">{displayFlight.airlineName ?? displayFlight.airlineIata ?? "Aviation"}</p>
                  <h1 className="text-5xl font-semibold tracking-tighter text-white font-mono uppercase">{displayFlight.flightIata ?? displayFlight.flightNumber}</h1>
                  <p className="text-sm text-muted-foreground font-mono flex items-center gap-2">
                    <Plane className="size-3.5" />
                    {displayFlight.aircraftRegistration ?? displayFlight.aircraftIata ?? "Unknown Equipment"}
                  </p>
                </div>
                <div className={`px-3 py-1 rounded border text-[10px] uppercase font-bold tracking-widest font-mono
                  ${displayFlight.status === 'active' ? 'bg-primary/20 text-primary border-primary/30' : 'bg-muted/50 text-muted-foreground border-white/10'}`}>
                  {displayFlight.status ?? "Scheduled"}
                </div>
              </div>

              {/* Route */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 glass-panel p-6 rounded-lg">
                <div className="space-y-2">
                  <p className="text-label">Departure</p>
                  <p className="text-4xl font-mono text-white">{displayFlight.departureIata ?? "—"}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">{displayFlight.departureAirport ?? ""}</p>
                  <p className="font-mono text-sm text-white/80">{displayFlight.departureScheduled ?? "—"}</p>
                </div>
                <div className="flex flex-col items-center gap-2 opacity-50">
                  <div className="h-px w-12 bg-white/20" />
                  <Plane className="size-5 rotate-90" />
                  <div className="h-px w-12 bg-white/20" />
                </div>
                <div className="space-y-2 text-right">
                  <p className="text-label">Arrival</p>
                  <p className="text-4xl font-mono text-white">{displayFlight.arrivalIata ?? "—"}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[200px] ml-auto">{displayFlight.arrivalAirport ?? ""}</p>
                  <p className="font-mono text-sm text-white/80">{displayFlight.arrivalScheduled ?? "—"}</p>
                </div>
              </div>

              {/* Live Telemetry */}
              <div className="space-y-4">
                <h3 className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground flex items-center gap-2 border-b border-white/5 pb-2">
                  <Navigation className="size-3.5" /> Live Telemetry
                </h3>
                {tracking ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <DataBlock label="Altitude" value={tracking.altitude ? `${tracking.altitude}` : "—"} unit="m" />
                    <DataBlock label="Speed" value={tracking.speed ? `${tracking.speed}` : "—"} unit="km/h" />
                    <DataBlock label="Heading" value={tracking.direction ? `${tracking.direction}` : "—"} unit="°" />
                    <DataBlock label="Vertical" value={tracking.speedVertical ? `${tracking.speedVertical}` : "—"} unit="m/s" />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground font-mono">No live telemetry available for this flight.</p>
                )}
              </div>

              {/* Weather */}
              {weather && (
                <div className="space-y-4">
                  <h3 className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground flex items-center gap-2 border-b border-white/5 pb-2">
                    <Thermometer className="size-3.5" /> Local Conditions
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <DataBlock label="Temp" value={weather.temperature} unit="°C" />
                    <DataBlock label="Wind" value={weather.windSpeed} unit="km/h" icon={<Wind className="size-3 opacity-50"/>} />
                    <DataBlock label="Condition" value={weather.weatherCondition} unit="" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT 40% Map */}
      <div className="w-full lg:w-[40%] h-[40dvh] lg:h-full relative bg-black shrink-0">
        <TrackingMap live={livePoint} />
        <div className="absolute inset-0 pointer-events-none shadow-[inset_1px_0_20px_rgba(0,0,0,0.5)] z-10" />
      </div>
    </div>
  );
}

function DataBlock({ label, value, unit, icon }: { label: string, value: any, unit: string, icon?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">{icon}{label}</p>
      <p className="font-mono text-lg text-white">
        {value ?? "—"} <span className="text-xs text-muted-foreground">{value ? unit : ""}</span>
      </p>
    </div>
  );
}
