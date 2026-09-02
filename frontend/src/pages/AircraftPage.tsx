import { useState } from "react";
import { flightService } from "@/services/flight.service";
import { ApiError } from "@/services/api";
import type { FlightDto } from "@/types/api";
import { AircraftViewer } from "@/components/aircraft/AircraftViewer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Plane, Search, AlertCircle, Info, Wrench, Box } from "lucide-react";

export function AircraftPage() {
  const [flightIata, setFlightIata] = useState("");
  const [flight, setFlight] = useState<FlightDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSearch = async () => {
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
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Plane className="size-6 text-primary" /> Aircraft</h1>
        <p className="text-sm text-muted-foreground">No dedicated <code className="bg-muted px-1 rounded">/api/aircraft</code> endpoint — aircraft data comes from <code className="bg-muted px-1 rounded">FlightDto</code> (<code className="bg-muted px-1 rounded">aircraftRegistration/Iata/Icao</code>). Viewer is a procedural foundation.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Box className="size-4" /> 3D Aircraft Viewer</CardTitle>
            <CardDescription>Orbit • Zoom • Rotate • Procedural fuselage/wings. Replace asset at <code className="bg-muted px-1 rounded">public/models/aircraft.glb</code> (see docs).</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <AircraftViewer />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Search className="size-4" /> Inspect aircraft via flight</CardTitle>
              <CardDescription className="text-xs">Enter a flight to load its aircraft fields — no fake registry.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="air-flight">Flight IATA</Label>
                <div className="flex gap-2">
                  <Input id="air-flight" placeholder="LH400" value={flightIata} onChange={(e) => setFlightIata(e.target.value)} className="font-mono" />
                  <Button onClick={doSearch} disabled={loading} className="gap-2">{loading ? <Skeleton className="size-4 rounded-full" /> : <Search className="size-4" />}Inspect</Button>
                </div>
              </div>
              {error && <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Error</AlertTitle><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
              {loading && <Skeleton className="h-24 w-full" />}
              {!loading && !flight && !error && (
                <Alert>
                  <Info className="size-4" />
                  <AlertTitle className="text-xs">No aircraft selected</AlertTitle>
                  <AlertDescription className="text-xs">Search a flight to see its aircraft. Viewer above is independent of search.</AlertDescription>
                </Alert>
              )}
              {flight && (
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Wrench className="size-4" /> Aircraft details</CardTitle>
                    <CardDescription className="text-xs">From <code className="bg-background px-1 rounded border">GET /api/flights/search</code> • flight <code className="bg-background px-1 rounded border">{flight.flightIata ?? flight.flightNumber}</code></CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Registration</span><span className="font-mono font-medium">{flight.aircraftRegistration ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">IATA</span><span className="font-mono">{flight.aircraftIata ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">ICAO</span><span className="font-mono">{flight.aircraftIcao ?? "—"}</span></div>
                    <Separator />
                    <div className="flex justify-between"><span className="text-muted-foreground">Airline</span><span>{flight.airlineName ?? flight.airlineIata ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Flight status</span><Badge variant="outline" className="text-[10px]">{flight.status ?? "—"}</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Route</span><span>{flight.departureIata ?? "—"} → {flight.arrivalIata ?? "—"}</span></div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">How to add a real model</CardTitle></CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <p>1. Obtain a licensed <code className="bg-muted px-1 rounded">.glb</code> (e.g., CC0 from Sketchfab/Poly Pizza).</p>
              <p>2. Place at <code className="bg-muted px-1 rounded">frontend/public/models/aircraft.glb</code>.</p>
              <p>3. In <code className="bg-muted px-1 rounded">AircraftViewer.tsx</code> replace <code className="bg-muted px-1 rounded">ProceduralAircraft</code> with <code className="bg-muted px-1 rounded">useGLTF("/models/aircraft.glb")</code> from <code className="bg-muted px-1 rounded">@react-three/drei</code>.</p>
              <p className="text-[11px]">Current viewer uses pure Three.js primitives — no external asset, no licensing risk.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Alert>
        <Plane className="size-4" />
        <AlertTitle className="text-xs">Backend limitation noted</AlertTitle>
        <AlertDescription className="text-xs">There is no standalone aircraft table/API. All aircraft fields are derived from flight DTOs. Do not invent <code className="bg-background px-1 rounded border">GET /api/aircraft</code> — viewer foundation will support real model later.</AlertDescription>
      </Alert>
    </div>
  );
}
