import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { flightService, type FlightSearchParams } from "@/services/flight.service";
import { airportService } from "@/services/airport.service";
import { weatherService } from "@/services/weather.service";
import { ApiError } from "@/services/api";
import type { FlightDto, FlightTrackingDto, WeatherDto } from "@/types/api";
import { TrackingMap } from "@/components/tracking/TrackingMap";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plane, AlertCircle, MapPin, Clock, Building2, Gauge, Navigation, RefreshCw, Ticket, Thermometer, Wind, Droplets } from "lucide-react";

function formatStatus(status: string | null) {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  const s = (status ?? "").toLowerCase();
  if (s === "active" || s === "en-route" || s === "en route") return "default";
  if (s === "landed" || s === "arrived") return "secondary";
  if (s === "cancelled" || s === "incident" || s === "diverted") return "destructive";
  return "outline";
}

export function TrackingPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [flightIata, setFlightIata] = useState(searchParams.get("flight_iata") ?? "");
  const [depIata, setDepIata] = useState(searchParams.get("dep_iata") ?? "");
  const [arrIata, setArrIata] = useState(searchParams.get("arr_iata") ?? "");
  const [airlineIata, setAirlineIata] = useState(searchParams.get("airline_iata") ?? "");
  const [flightStatus, setFlightStatus] = useState(searchParams.get("flight_status") ?? "");
  const [limit, setLimit] = useState(searchParams.get("limit") ?? "10");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [results, setResults] = useState<FlightDto[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selected, setSelected] = useState<FlightDto | null>(null);
  const [detail, setDetail] = useState<FlightDto | null>(null);
  const [tracking, setTracking] = useState<FlightTrackingDto | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [depCoords, setDepCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [arrCoords, setArrCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [weather, setWeather] = useState<WeatherDto | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const buildParams = (): FlightSearchParams => {
    const p: FlightSearchParams = {};
    if (flightIata.trim()) p.flight_iata = flightIata.trim();
    if (depIata.trim()) p.dep_iata = depIata.trim().toUpperCase();
    if (arrIata.trim()) p.arr_iata = arrIata.trim().toUpperCase();
    if (airlineIata.trim()) p.airline_iata = airlineIata.trim().toUpperCase();
    if (flightStatus && flightStatus !== "all") p.flight_status = flightStatus;
    const l = parseInt(limit, 10);
    if (!isNaN(l)) p.limit = l;
    return p;
  };

  const doSearch = async (params?: FlightSearchParams) => {
    const p = params ?? buildParams();
    // must have at least one filter; backend allows empty but we require something to avoid huge results
    if (!p.flight_iata && !p.dep_iata && !p.arr_iata && !p.airline_iata && !p.flight_status) {
      setSearchError("Enter at least one search filter (flight IATA, departure, arrival, airline, or status).");
      return;
    }
    if (p.flight_status && !p.flight_iata && !p.dep_iata && !p.arr_iata && !p.airline_iata) {
      setSearchError("Status filter requires an airport code — enter a departure, arrival, or flight IATA to narrow the search.");
      return;
    }
    if (p.dep_iata && !/^[A-Za-z]{3}$/.test(p.dep_iata)) {
      setSearchError("dep_iata must be a 3-letter IATA code.");
      return;
    }
    if (p.arr_iata && !/^[A-Za-z]{3}$/.test(p.arr_iata)) {
      setSearchError("arr_iata must be a 3-letter IATA code.");
      return;
    }
    setLoadingSearch(true);
    setSearchError(null);
    setResults(null);
    setCount(null);
    try {
      const res = await flightService.search(p);
      setResults(res.flights);
      setCount(res.count);
      // sync URL
      const sp = new URLSearchParams();
      if (p.flight_iata) sp.set("flight_iata", p.flight_iata);
      if (p.dep_iata) sp.set("dep_iata", p.dep_iata);
      if (p.arr_iata) sp.set("arr_iata", p.arr_iata);
      if (p.airline_iata) sp.set("airline_iata", p.airline_iata);
      if (p.flight_status && p.flight_status !== "all") sp.set("flight_status", p.flight_status);
      if (p.limit) sp.set("limit", String(p.limit));
      setSearchParams(sp, { replace: true });
    } catch (e) {
      if (e instanceof ApiError) setSearchError(e.message);
      else setSearchError("Search failed.");
    } finally {
      setLoadingSearch(false);
    }
  };

  // Auto search on mount if query present (Home → Tracking)
  useEffect(() => {
    const q = searchParams.get("flight_iata");
    if (q && !results && !loadingSearch) {
      setFlightIata(q);
      doSearch({ flight_iata: q, limit: parseInt(limit, 10) || 10 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = async (f: FlightDto) => {
    setSelected(f);
    setDetail(null);
    setTracking(null);
    setDetailError(null);
    setLoadingDetail(true);
    setDepCoords(null);
    setArrCoords(null);
    setWeather(null);
    setWeatherError(null);
    setLoadingWeather(false);
    const flightNumber = f.flightIata ?? f.flightNumber ?? "";
    if (!flightNumber) {
      setDetailError("No flight number available for details.");
      setLoadingDetail(false);
      return;
    }
    try {
      const [d, t] = await Promise.all([
        flightService.getByFlightNumber(flightNumber).catch(() => null),
        flightService.getTracking(flightNumber).catch(() => null),
      ]);
      if (d) setDetail(d);
      else setDetail(f); // fallback to list item
      if (t) {
        setTracking(t);
        if (t.latitude != null && t.longitude != null) {
          setLoadingWeather(true);
          setWeatherError(null);
          weatherService
            .getByCoordinates(t.latitude, t.longitude)
            .then(setWeather)
            .catch((e) => {
              if (e instanceof ApiError) setWeatherError(e.message);
              else setWeatherError("Weather unavailable.");
            })
            .finally(() => setLoadingWeather(false));
        }
      }
      // try to resolve airport coords for map
      const toFetch: Array<Promise<void>> = [];
      const depIataVal = (t?.departureIata ?? f.departureIata) ?? null;
      const arrIataVal = (t?.arrivalIata ?? f.arrivalIata) ?? null;
      if (depIataVal && /^[A-Za-z]{3}$/.test(depIataVal)) {
        toFetch.push(
          airportService
            .getByIata(depIataVal)
            .then((a) => {
              if (a.latitude != null && a.longitude != null) setDepCoords({ lat: a.latitude, lng: a.longitude });
            })
            .catch(() => {})
        );
      }
      if (arrIataVal && /^[A-Za-z]{3}$/.test(arrIataVal)) {
        toFetch.push(
          airportService
            .getByIata(arrIataVal)
            .then((a) => {
              if (a.latitude != null && a.longitude != null) setArrCoords({ lat: a.latitude, lng: a.longitude });
            })
            .catch(() => {})
        );
      }
      await Promise.all(toFetch);
    } catch (e) {
      if (e instanceof ApiError) setDetailError(e.message);
      else setDetailError("Failed to load flight details.");
    } finally {
      setLoadingDetail(false);
    }
  };

  const livePoint = tracking?.latitude != null && tracking?.longitude != null ? { lat: tracking.latitude, lng: tracking.longitude, label: tracking.flightIata ?? tracking.flightNumber ?? "Aircraft", subLabel: tracking.status ?? undefined } : null;

  const depPoint =
    depCoords && (detail ?? selected)
      ? { lat: depCoords.lat, lng: depCoords.lng, label: (detail ?? selected)?.departureIata ?? "Departure", subLabel: (detail ?? selected)?.departureAirport ?? undefined }
      : null;
  const arrPoint =
    arrCoords && (detail ?? selected)
      ? { lat: arrCoords.lat, lng: arrCoords.lng, label: (detail ?? selected)?.arrivalIata ?? "Arrival", subLabel: (detail ?? selected)?.arrivalAirport ?? undefined }
      : null;

  const displayFlight = detail ?? selected;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Plane className="size-6 text-primary" /> Flight Tracking
        </h1>
        <p className="text-sm text-muted-foreground">Search via <code className="bg-muted px-1 rounded">GET /api/flights/search</code> and inspect live tracking via <code className="bg-muted px-1 rounded">GET /api/flights/{"{flightNumber}"}/tracking</code>.</p>
      </div>

      {/* Search / filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Search className="size-4" /> Search filters</CardTitle>
          <CardDescription>Flight identifier uses backend <code className="bg-muted px-1 rounded text-xs">flight_iata</code>. Other filters optional — keep UI simple.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="f_iata">Flight IATA</Label>
              <Input id="f_iata" placeholder="LH400" value={flightIata} onChange={(e) => setFlightIata(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep">Departure IATA</Label>
              <Input id="dep" placeholder="DEL" maxLength={3} value={depIata} onChange={(e) => setDepIata(e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="arr">Arrival IATA</Label>
              <Input id="arr" placeholder="BOM" maxLength={3} value={arrIata} onChange={(e) => setArrIata(e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="airline">Airline IATA</Label>
              <Input id="airline" placeholder="LH" value={airlineIata} onChange={(e) => setAirlineIata(e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Flight status</Label>
              <Select value={flightStatus} onValueChange={(v) => setFlightStatus(v ?? "")}>
                <SelectTrigger id="status"><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="landed">Landed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="incident">Incident</SelectItem>
                  <SelectItem value="diverted">Diverted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="limit" className="text-xs">Limit</Label>
              <Select value={limit} onValueChange={(v) => setLimit(v ?? "10")}>
                <SelectTrigger id="limit" className="w-[90px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => doSearch()} disabled={loadingSearch} className="gap-2">
              {loadingSearch ? <RefreshCw className="size-4 animate-spin" /> : <Search className="size-4" />}
              Search
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)}>
              {showAdvanced ? "Hide" : "Advanced"} info
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFlightIata("");
                setDepIata("");
                setArrIata("");
                setAirlineIata("");
                setFlightStatus("");
                setLimit("10");
                setResults(null);
                setCount(null);
                setSearchError(null);
                setSearchParams(new URLSearchParams(), { replace: true });
              }}
            >
              Clear
            </Button>
          </div>

          {showAdvanced && (
            <Alert>
              <AlertTitle className="text-xs">Backend sorting</AlertTitle>
              <AlertDescription className="text-xs">API also supports <code className="bg-background px-1 rounded border">sortBy</code> + <code className="bg-background px-1 rounded border">order</code> (asc/desc). Not exposed in UI to keep it simple — add later if needed.</AlertDescription>
            </Alert>
          )}

          {searchError && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Search error</AlertTitle>
              <AlertDescription className="text-xs">{searchError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* 60/40 layout */}
      <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr] items-start">
        {/* Left: map + results */}
        <div className="space-y-6">
          <TrackingMap live={livePoint} departure={depPoint} arrival={arrPoint} altitude={tracking?.altitude} speed={tracking?.speed} />

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm">Results {count != null && <span className="text-muted-foreground font-normal">({count})</span>}</CardTitle>
                <CardDescription className="text-xs">Select a flight to view details & tracking.</CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">{results ? `${results.length} shown` : "—"}</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingSearch && (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-[88px] w-full" />
                  ))}
                </div>
              )}
              {!loadingSearch && !results && !searchError && (
                <Alert>
                  <Search className="size-4" />
                  <AlertTitle className="text-xs">No search yet</AlertTitle>
                  <AlertDescription className="text-xs">Enter a filter and press Search — or arrive via Home with <code className="bg-muted px-1 rounded">?flight_iata=</code>.</AlertDescription>
                </Alert>
              )}
              {!loadingSearch && results && results.length === 0 && (
                <Alert>
                  <AlertCircle className="size-4" />
                  <AlertTitle>No flights found</AlertTitle>
                  <AlertDescription className="text-xs">Try a different IATA or relax filters. Backend returned <code className="bg-muted px-1 rounded">count 0</code>.</AlertDescription>
                </Alert>
              )}
              {results && results.length > 0 && (
                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {results.map((f) => {
                    const key = f.flightNumber ?? f.flightIata ?? `${f.airlineIata}-${Math.random()}`;
                    const isSelected = selected?.flightNumber === f.flightNumber || selected?.flightIata === f.flightIata;
                    return (
                      <button
                        key={key}
                        onClick={() => handleSelect(f)}
                        className={`w-full text-left rounded-lg border p-3 flex flex-col gap-2 hover:bg-muted/50 transition-colors ${isSelected ? "bg-muted border-primary/30 ring-1 ring-primary/20" : "bg-card"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm font-semibold flex items-center gap-1.5">
                            <Ticket className="size-3.5 text-primary" />
                            {f.flightIata ?? f.flightNumber ?? "—"}
                          </span>
                          <Badge variant={statusVariant(f.status)} className="text-[10px]">{formatStatus(f.status)}</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Building2 className="size-3" />{f.airlineName ?? f.airlineIata ?? "—"}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><Plane className="size-3" />{f.aircraftRegistration ?? f.aircraftIata ?? "—"}</span>
                        </div>
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                          <div>
                            <div className="font-semibold">{f.departureIata ?? "—"}</div>
                            <div className="text-muted-foreground truncate">{f.departureAirport ?? ""}</div>
                            <div className="text-muted-foreground">{f.departureScheduled ?? f.departureEstimated ?? ""}</div>
                          </div>
                          <div className="text-center text-muted-foreground">→</div>
                          <div className="text-right">
                            <div className="font-semibold">{f.arrivalIata ?? "—"}</div>
                            <div className="text-muted-foreground truncate">{f.arrivalAirport ?? ""}</div>
                            <div className="text-muted-foreground">{f.arrivalScheduled ?? f.arrivalEstimated ?? ""}</div>
                          </div>
                        </div>
                        {(f.departureDelay || f.arrivalDelay) && (
                          <div className="text-xs text-muted-foreground">Delay: DEP {f.departureDelay ?? "—"} • ARR {f.arrivalDelay ?? "—"}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {searchError && !loadingSearch && results === null && (
                <Button variant="outline" size="sm" onClick={() => doSearch()} className="gap-2">
                  <RefreshCw className="size-4" /> Retry
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: details */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Clock className="size-4" /> Flight details</CardTitle>
              <CardDescription className="text-xs">From <code className="bg-muted px-1 rounded">GET /api/flights/{"{flightNumber}"}</code></CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingDetail && (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-20 w-full" />
                </div>
              )}
              {!loadingDetail && !displayFlight && (
                <Alert>
                  <InfoIcon />
                  <AlertTitle className="text-xs">No flight selected</AlertTitle>
                  <AlertDescription className="text-xs">Choose a result on the left to load details.</AlertDescription>
                </Alert>
              )}
              {detailError && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Details error</AlertTitle>
                  <AlertDescription className="text-xs">{detailError}</AlertDescription>
                </Alert>
              )}
              {displayFlight && !loadingDetail && (
                <Tabs defaultValue="flight" className="w-full">
                  <TabsList className="w-full">
                    <TabsTrigger value="flight" className="flex-1 text-xs">Flight</TabsTrigger>
                    <TabsTrigger value="schedule" className="flex-1 text-xs">Schedule</TabsTrigger>
                    <TabsTrigger value="aircraft" className="flex-1 text-xs">Aircraft</TabsTrigger>
                  </TabsList>
                  <TabsContent value="flight" className="space-y-3 pt-3">
                    <DetailRow label="Flight" value={displayFlight.flightIata ?? displayFlight.flightNumber} />
                    <DetailRow label="Number" value={displayFlight.flightNumber} />
                    <DetailRow label="ICAO" value={displayFlight.flightIcao} />
                    <DetailRow label="Airline" value={`${displayFlight.airlineName ?? ""} ${displayFlight.airlineIata ? `(${displayFlight.airlineIata})` : ""}`} />
                    <DetailRow label="Airline ICAO" value={displayFlight.airlineIcao} />
                    <DetailRow label="Status" value={<Badge variant={statusVariant(displayFlight.status)}>{formatStatus(displayFlight.status)}</Badge>} />
                  </TabsContent>
                  <TabsContent value="schedule" className="space-y-3 pt-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold flex items-center gap-1"><MapPin className="size-3" /> Departure</p>
                      <DetailRow label="Airport" value={displayFlight.departureAirport} />
                      <DetailRow label="IATA" value={displayFlight.departureIata} />
                      <DetailRow label="ICAO" value={displayFlight.departureIcao} />
                      <DetailRow label="Terminal/Gate" value={`${displayFlight.departureTerminal ?? "—"} / ${displayFlight.departureGate ?? "—"}`} />
                      <DetailRow label="Scheduled" value={displayFlight.departureScheduled} />
                      <DetailRow label="Estimated" value={displayFlight.departureEstimated} />
                      <DetailRow label="Actual" value={displayFlight.departureActual} />
                      <DetailRow label="Delay" value={displayFlight.departureDelay} />
                    </div>
                    <Separator />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold flex items-center gap-1"><MapPin className="size-3" /> Arrival</p>
                      <DetailRow label="Airport" value={displayFlight.arrivalAirport} />
                      <DetailRow label="IATA" value={displayFlight.arrivalIata} />
                      <DetailRow label="ICAO" value={displayFlight.arrivalIcao} />
                      <DetailRow label="Terminal/Gate" value={`${displayFlight.arrivalTerminal ?? "—"} / ${displayFlight.arrivalGate ?? "—"}`} />
                      <DetailRow label="Scheduled" value={displayFlight.arrivalScheduled} />
                      <DetailRow label="Estimated" value={displayFlight.arrivalEstimated} />
                      <DetailRow label="Actual" value={displayFlight.arrivalActual} />
                      <DetailRow label="Delay" value={displayFlight.arrivalDelay} />
                    </div>
                  </TabsContent>
                  <TabsContent value="aircraft" className="space-y-3 pt-3">
                    <DetailRow label="Registration" value={displayFlight.aircraftRegistration} />
                    <DetailRow label="IATA" value={displayFlight.aircraftIata} />
                    <DetailRow label="ICAO" value={displayFlight.aircraftIcao} />
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Navigation className="size-4" /> Live tracking</CardTitle>
              <CardDescription className="text-xs">From <code className="bg-muted px-1 rounded">GET /api/flights/{"{flightNumber}"}/tracking</code></CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingDetail && <Skeleton className="h-20 w-full" />}
              {!loadingDetail && !tracking && displayFlight && (
                <Alert>
                  <Gauge className="size-4" />
                  <AlertTitle className="text-xs">No live data</AlertTitle>
                  <AlertDescription className="text-xs">Live position is currently unavailable.</AlertDescription>
                </Alert>
              )}
              {!tracking && !displayFlight && <p className="text-xs text-muted-foreground">Select a flight first.</p>}
              {tracking && (
                <div className="space-y-2 text-xs">
                  <DetailRow label="Flight date" value={tracking.flightDate} />
                  <DetailRow label="Status" value={tracking.status} />
                  <DetailRow label="Route" value={tracking.route} />
                  <Separator />
                  <DetailRow label="Latitude" value={tracking.latitude?.toString() ?? "—"} />
                  <DetailRow label="Longitude" value={tracking.longitude?.toString() ?? "—"} />
                  <DetailRow label="Altitude" value={tracking.altitude != null ? `${tracking.altitude} m` : "—"} />
                  <DetailRow label="Speed" value={tracking.speed != null ? `${tracking.speed} km/h` : "—"} />
                  <DetailRow label="Vertical speed" value={tracking.speedVertical?.toString() ?? "—"} />
                  <DetailRow label="Direction" value={tracking.direction != null ? `${tracking.direction}°` : "—"} />
                  <DetailRow label="Is ground" value={tracking.isGround != null ? String(tracking.isGround) : "—"} />
                  <DetailRow label="Live updated" value={tracking.liveUpdated} />
                  <DetailRow label="Departure delay" value={tracking.departureDelay} />
                  <DetailRow label="Arrival delay" value={tracking.arrivalDelay} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Thermometer className="size-4" /> Current weather at position</CardTitle>
              <CardDescription className="text-xs">Via <code className="bg-muted px-1 rounded">GET /api/weather?latitude&longitude</code> — only when coords valid</CardDescription>
            </CardHeader>
            <CardContent>
              {!tracking && <p className="text-xs text-muted-foreground">Select a flight with live position to load weather.</p>}
              {tracking && (tracking.latitude == null || tracking.longitude == null) && <p className="text-xs text-muted-foreground">No coordinates — weather unavailable.</p>}
              {tracking && tracking.latitude != null && tracking.longitude != null && (
                <>
                  {loadingWeather && <Skeleton className="h-16 w-full" />}
                  {weatherError && <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Weather error</AlertTitle><AlertDescription className="text-xs">{weatherError}</AlertDescription></Alert>}
                  {!loadingWeather && weather && (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border bg-muted/20 p-3 space-y-1"><div className="text-muted-foreground flex items-center gap-1"><Thermometer className="size-3" /> Temp</div><div className="text-lg font-semibold">{weather.temperature}°C</div><div className="text-muted-foreground">{weather.weatherCondition ?? "—"}</div></div>
                      <div className="rounded-lg border p-3 space-y-1"><div className="text-muted-foreground flex items-center gap-1"><Wind className="size-3" /> Wind</div><div className="text-lg font-semibold">{weather.windSpeed ?? "—"} km/h</div><div className="text-muted-foreground">Hum {weather.humidity ?? "—"}%</div></div>
                      <div className="rounded-lg border p-3 space-y-1"><div className="text-muted-foreground flex items-center gap-1"><Droplets className="size-3" /> Precip</div><div className="text-lg font-semibold">{weather.precipitation ?? "—"} mm</div><div className="text-muted-foreground">Feels {weather.apparentTemperature ?? "—"}°C</div></div>
                      <div className="rounded-lg border p-3 space-y-1"><div className="text-muted-foreground">Timezone</div><div className="font-medium">{weather.timezone ?? "—"}</div><div className="text-muted-foreground text-[11px]">{weather.observationTime ? new Date(weather.observationTime).toLocaleString() : ""}</div></div>
                    </div>
                  )}
                  {!loadingWeather && !weather && !weatherError && tracking.latitude != null && <p className="text-xs text-muted-foreground">Weather will load automatically.</p>}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  const display = value == null || value === "" ? "—" : value;
  return (
    <div className="flex justify-between gap-4 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right break-all">{display as string}</span>
    </div>
  );
}

function InfoIcon() {
  return <AlertCircle className="size-4" />;
}
