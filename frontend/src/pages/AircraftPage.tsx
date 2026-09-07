import { useState } from "react";
import { flightService } from "@/services/flight.service";
import { ApiError } from "@/services/api";
import type { FlightDto } from "@/types/api";
import { AircraftViewer } from "@/components/aircraft/AircraftViewer";
import { Input } from "@/components/ui/input";
import { Search, Eye, AlertCircle, Loader2 } from "lucide-react";

export function AircraftPage() {
  const [flightIata, setFlightIata] = useState("");
  const [flight, setFlight] = useState<FlightDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = flightIata.trim();
    if (!q) {
      setError("Enter a flight IATA (e.g., LH400) to inspect its aircraft.");
      return;
    }
    setError(null);
    setLoading(true);
    setFlight(null);
    try {
      const res = await flightService.search({ flight_iata: q, limit: 5 });
      if (res.flights.length === 0) {
        setError("No flight found for that identifier.");
      } else {
        setFlight(res.flights[0]);
      }
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Search failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col h-[100dvh] pt-20 bg-background relative overflow-hidden">
      
      {/* 3D Viewer Area - Absolute positioned for full immersion */}
      <div className="absolute inset-0 z-0 bg-gradient-to-tr from-background via-background/90 to-primary/10 flex items-center justify-center pt-20 pointer-events-auto">
        <AircraftViewer />
      </div>

      <div className="relative z-10 w-full h-full flex flex-col pointer-events-none p-6 pb-12 lg:p-12">
        {/* Top Controls */}
        <div className="flex items-start justify-between pointer-events-auto">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">Equipment Registry</h1>
            <p className="text-xs uppercase tracking-widest font-mono text-muted-foreground">3D Fleet Visualization</p>
          </div>

          <form onSubmit={handleSearch} className="glass-panel rounded flex items-center p-1 w-72 transition-colors focus-within:border-primary/50">
            <Search className="size-4 text-muted-foreground ml-3 shrink-0" />
            <Input
              value={flightIata}
              onChange={(e) => setFlightIata(e.target.value)}
              placeholder="Flight IATA (e.g. LH400)"
              className="border-0 bg-transparent text-white placeholder:text-white/40 focus-visible:ring-0 text-xs shadow-none font-mono h-8 uppercase"
              disabled={loading}
            />
            {loading && <Loader2 className="size-4 text-primary mr-3 animate-spin shrink-0" />}
          </form>
        </div>

        {error && (
          <div className="pointer-events-auto mt-4 max-w-sm rounded p-3 border border-destructive/30 bg-destructive/10 flex items-center gap-3">
            <AlertCircle className="size-4 text-destructive shrink-0" />
            <span className="text-xs text-destructive">{error}</span>
          </div>
        )}

        {/* Floating Metadata (Bottom Left) */}
        <div className="mt-auto max-w-sm glass-panel p-6 rounded-lg pointer-events-auto space-y-6">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded bg-white/5 flex items-center justify-center">
              <Eye className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Registration</p>
              <p className="font-mono text-lg font-bold text-white uppercase">
                {flight ? (flight.aircraftRegistration ?? "UNKNOWN") : "AWAITING QUERY"}
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">IATA / ICAO</p>
              <p className="font-mono text-xs text-white uppercase">{flight?.aircraftIata ?? "—"} / {flight?.aircraftIcao ?? "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Airline</p>
              <p className="font-mono text-xs text-white uppercase">{flight?.airlineName ?? flight?.airlineIata ?? "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Flight Route</p>
              <p className="font-mono text-xs text-white uppercase">{flight ? `${flight.departureIata ?? "?"} → ${flight.arrivalIata ?? "?"}` : "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Flight Status</p>
              <p className="font-mono text-xs text-white uppercase">{flight?.status ?? "—"}</p>
            </div>
          </div>

          {!flight && (
            <div className="text-[10px] text-muted-foreground leading-relaxed mt-2">
              Enter a live flight identifier above to extract assigned aircraft telemetry. 3D procedural matrix is independent.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
