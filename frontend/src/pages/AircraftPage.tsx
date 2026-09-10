import { useState, useRef } from "react";
import { AircraftViewer } from "@/components/aircraft/AircraftViewer";
import { resolveDemoFlight, type DemoFlight } from "@/data/demoFlights";
import { getSeatMap, getSeatInfo, parseSeatId, type SeatMap } from "@/data/seatMaps";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Plane, Search, AlertCircle, Info, Calendar, Hash, Armchair, Crosshair, MapPin } from "lucide-react";

const DEFAULT_DATE = "2026-09-10";

export function AircraftPage() {
  const [flightInput, setFlightInput] = useState("6E1234");
  const [dateInput, setDateInput] = useState(DEFAULT_DATE);
  const [demoFlight, setDemoFlight] = useState<DemoFlight | null>(null);
  const [seatMap, setSeatMap] = useState<SeatMap | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [findSeatInput, setFindSeatInput] = useState("12A");
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [seatFindError, setSeatFindError] = useState<string | null>(null);
  const seatRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const doSearch = () => {
    const flight = flightInput.trim();
    const date = dateInput.trim();
    setSearchError(null);
    setNotFound(false);
    setSeatFindError(null);
    setSelectedSeatId(null);

    if (!flight) {
      setSearchError("Enter a flight number (e.g., 6E1234).");
      setHasSearched(true);
      return;
    }
    if (!date) {
      setSearchError("Select a travel date.");
      setHasSearched(true);
      return;
    }

    const resolved = resolveDemoFlight(flight, date);
    if (!resolved) {
      setDemoFlight(null);
      setSeatMap(null);
      setNotFound(true);
      setHasSearched(true);
      return;
    }

    setDemoFlight(resolved);
    const map = getSeatMap(resolved.seatMapKey);
    setSeatMap(map);
    setHasSearched(true);
    setNotFound(false);
  };

    const handleFindSeat = () => {
    if (!seatMap) return;
    const input = findSeatInput.trim();
    if (!input) {
      setSeatFindError("Enter a seat number (e.g., 12A).");
      return;
    }
    const parsed = parseSeatId(input);
    if (!parsed) {
      setSeatFindError(`Seat ${input.toUpperCase()} was not found in this configuration.`);
      return;
    }
    const info = getSeatInfo(seatMap, parsed.row, parsed.letter);
    if (!info) {
      setSeatFindError(`Seat ${input.toUpperCase()} was not found in this configuration.`);
      return;
    }
    setSelectedSeatId(info.id);
    setSeatFindError(null);
    const el = seatRefs.current[info.id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  const handleSeatClick = (seatId: string) => {
    setSelectedSeatId(seatId);
    setSeatFindError(null);
  };

  const selectedSeatInfo = seatMap && selectedSeatId ? getSeatInfo(seatMap, parseInt(selectedSeatId.slice(0, -1), 10), selectedSeatId.slice(-1)) : null;

  return (
    <div className="mx-auto max-w-[1100px] space-y-8 px-4 py-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Plane className="size-6 text-primary" /> Aircraft Explorer
        </h1>
        <p className="text-sm text-muted-foreground">Discover the aircraft and cabin layout for your flight.</p>
      </div>

      {/* Search */}
      <Card className="border-white/10 bg-card/40 backdrop-blur">
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] items-end">
            <div className="space-y-1.5">
              <Label htmlFor="air-flight" className="flex items-center gap-1.5 text-xs">
                <Hash className="size-3.5 text-muted-foreground" /> Flight number
              </Label>
              <Input
                id="air-flight"
                placeholder="6E1234"
                value={flightInput}
                onChange={(e) => setFlightInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
                className="font-mono h-10"
              />
              <p className="text-[11px] text-muted-foreground">Try demo flight 6E1234</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="air-date" className="flex items-center gap-1.5 text-xs">
                <Calendar className="size-3.5 text-muted-foreground" /> Travel date
              </Label>
              <Input id="air-date" type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} className="h-10" />
              <p className="text-[11px] text-muted-foreground">Prototype date 2026-09-10</p>
            </div>
            <Button onClick={doSearch} className="h-10 gap-2 sm:mt-0 mt-2">
              <Search className="size-4" /> Search aircraft
            </Button>
          </div>
          {searchError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="size-4" />
              <AlertTitle className="text-xs">Enter flight details</AlertTitle>
              <AlertDescription className="text-xs">{searchError}</AlertDescription>
            </Alert>
          )}
          {notFound && (
            <Alert className="mt-4 border-amber-500/20 bg-amber-500/10">
              <Info className="size-4 text-amber-500" />
              <AlertTitle className="text-xs text-amber-500">Demo flight not found</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                No demo flight matches <span className="font-mono font-medium text-foreground">{flightInput.trim().toUpperCase() || "—"}</span> on{" "}
                <span className="font-mono font-medium text-foreground">{dateInput || "—"}</span>. This prototype currently supports only{" "}
                <span className="font-mono text-foreground">6E1234 on 2026-09-10</span>. Additional live lookup will be enabled later through AeroDataBox.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Initial hint before search */}
      {!hasSearched && !demoFlight && (
        <Alert>
          <Info className="size-4" />
          <AlertTitle className="text-xs">Prototype demo data</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground">
            Enter <span className="font-mono text-foreground">6E1234</span> and <span className="font-mono text-foreground">2026-09-10</span> to explore the IndiGo A320neo 186-seat cabin and 3D model. Seat availability is not shown.
          </AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {demoFlight && seatMap && (
        <>
          {/* Demo badge */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-[11px] tracking-widest">DEMO DATA</Badge>
            <span className="text-xs text-muted-foreground">Prototype flight data — will be replaced by AeroDataBox</span>
          </div>

          {/* Main aircraft section 65/35 */}
          <div className="grid gap-6 lg:grid-cols-[1.65fr_0.95fr]">
            <Card className="overflow-hidden border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Plane className="size-4 text-primary" /> 3D Aircraft
                </CardTitle>
                <CardDescription className="text-xs">Orbit • Zoom • {demoFlight.aircraft} • {demoFlight.icaoType}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <AircraftViewer modelKey={demoFlight.modelKey} />
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-white/10 bg-card/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs tracking-widest text-muted-foreground">FLIGHT</CardTitle>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-mono font-bold tracking-tight">{demoFlight.flightNumber}</span>
                    <Badge variant="secondary" className="text-[11px]">{demoFlight.airline}</Badge>
                  </div>
                  <CardDescription className="text-xs flex items-center gap-1.5">
                    <Calendar className="size-3" /> {demoFlight.date} • <MapPin className="size-3" /> Prototype
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <p className="text-[11px] tracking-widest text-muted-foreground">AIRCRAFT</p>
                    <p className="text-base font-medium">{demoFlight.aircraft}</p>
                    <p className="text-xs font-mono text-muted-foreground">{demoFlight.icaoType} • Model {demoFlight.modelKey}</p>
                  </div>
                  <Separator />
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Registration</span>
                      <span className="font-mono">{demoFlight.registration ?? "Not available in demo data"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Configuration</span>
                      <span className="font-mono">{seatMap.totalSeats} seats</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Layout</span>
                      <span className="font-mono">{seatMap.letters.join("")} • 3-3</span>
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/20 border border-white/5 px-3 py-2 text-[11px] text-muted-foreground">Seat availability is not shown.</div>
                </CardContent>
              </Card>

              <Card className="border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Prototype note</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1.5">
                  <p>
                    This view uses local demo data for <span className="font-mono text-foreground">6E1234</span> →{" "}
                    <span className="font-mono text-foreground">{demoFlight.icaoType}</span>. Live aircraft resolution via AeroDataBox will replace{" "}
                    <code className="bg-muted px-1 rounded">demoFlights.ts</code> without changing the viewer or seat map.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Seat Explorer */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Armchair className="size-5 text-primary" />
              <h2 className="text-lg font-semibold tracking-tight">Seat Explorer</h2>
              <Badge variant="outline" className="text-[10px]">{seatMap.totalSeats} seats</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Explore the {seatMap.name} layout. Select any seat to locate it. Seat availability is not shown.
            </p>

            <Card className="border-white/10">
              <CardContent className="pt-5">
                <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                  <div className="flex-1 space-y-1.5 max-w-[260px]">
                    <Label htmlFor="find-seat" className="text-xs flex items-center gap-1">
                      <Crosshair className="size-3.5" /> Find my seat
                    </Label>
                    <Input
                      id="find-seat"
                      placeholder="12A"
                      value={findSeatInput}
                      onChange={(e) => setFindSeatInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === "Enter" && handleFindSeat()}
                      className="font-mono h-10"
                    />
                  </div>
                  <Button onClick={handleFindSeat} className="h-10 gap-2 shrink-0">
                    <Search className="size-4" /> Find
                  </Button>
                </div>
                {seatFindError && (
                  <Alert variant="destructive" className="mt-3">
                    <AlertCircle className="size-4" />
                    <AlertDescription className="text-xs">{seatFindError}</AlertDescription>
                  </Alert>
                )}
                {selectedSeatInfo && !seatFindError && (
                  <div className="mt-3 rounded-md border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="font-mono font-bold">{selectedSeatInfo.id}</span>
                      <span className="text-muted-foreground">•</span>
                      <span className="capitalize">{selectedSeatInfo.position} seat</span>
                      <span className="text-muted-foreground">•</span>
                      <span className="capitalize">{selectedSeatInfo.side} side</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground">Row {selectedSeatInfo.row}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-white/10">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 text-[11px] tracking-[0.2em] text-muted-foreground">
                    <span>FRONT</span>
                    <span className="text-primary">→</span>
                    <span className="hidden sm:inline">NOSE</span>
                  </div>

                  <div className="w-full overflow-x-auto pb-2">
                    <div className="flex gap-1.5 min-w-max mx-auto w-fit px-1">
                      {Array.from({ length: seatMap.rows }, (_, idx) => {
                        const row = idx + 1;
                        return (
                          <div key={row} className="flex flex-col items-center gap-1 shrink-0">
                            <div className="text-[11px] font-mono text-muted-foreground h-4 flex items-center">{row}</div>
                            {seatMap.letters.slice(0, 3).map((letter) => {
                              const id = `${row}${letter}`;
                              const isSelected = selectedSeatId === id;
                              return (
                                <button
                                  key={id}
                                  ref={(el) => {
                                    seatRefs.current[id] = el;
                                  }}
                                  onClick={() => handleSeatClick(id)}
                                  className={`size-7 sm:size-8 rounded-md border text-[11px] font-mono flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0 ${
                                    isSelected
                                      ? "bg-primary text-primary-foreground border-primary shadow"
                                      : "bg-background hover:bg-muted border-white/10 text-foreground"
                                  }`}
                                  aria-label={`Seat ${id}`}
                                >
                                  {letter}
                                </button>
                              );
                            })}
                            <div className="h-3 flex items-center justify-center">
                              <div className="w-7 sm:w-8 h-px bg-white/10" />
                            </div>
                            {seatMap.letters.slice(3).map((letter) => {
                              const id = `${row}${letter}`;
                              const isSelected = selectedSeatId === id;
                              return (
                                <button
                                  key={id}
                                  ref={(el) => {
                                    seatRefs.current[id] = el;
                                  }}
                                  onClick={() => handleSeatClick(id)}
                                  className={`size-7 sm:size-8 rounded-md border text-[11px] font-mono flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0 ${
                                    isSelected
                                      ? "bg-primary text-primary-foreground border-primary shadow"
                                      : "bg-background hover:bg-muted border-white/10 text-foreground"
                                  }`}
                                  aria-label={`Seat ${id}`}
                                >
                                  {letter}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] tracking-[0.2em] text-muted-foreground">
                    <span className="text-primary">→</span>
                    <span>REAR</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Aisle between C and D • Scroll horizontally to see all rows</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
