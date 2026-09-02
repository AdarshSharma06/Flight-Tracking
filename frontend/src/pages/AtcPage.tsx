import { useEffect, useState } from "react";
import { atcService } from "@/services/atc.service";
import { weatherService } from "@/services/weather.service";
import { ApiError } from "@/services/api";
import type { AnomalyResponse, PageResponse, TelemetryResponse, WeatherDto } from "@/types/api";
import { TrackingMap } from "@/components/tracking/TrackingMap";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Radar, ShieldAlert, Gauge, Navigation, MapPin, Clock, AlertCircle, RefreshCw, Plane, Thermometer, Wind, Droplets } from "lucide-react";

function isPageResponse<T>(v: unknown): v is PageResponse<T> {
  return typeof v === "object" && v !== null && "content" in v && "page" in v;
}

function severityVariant(s: string): "default" | "secondary" | "outline" {
  const v = s.toUpperCase();
  if (v === "CRITICAL") return "default";
  if (v === "HIGH") return "default";
  if (v === "MEDIUM") return "secondary";
  return "outline";
}
function statusVariant(s: string): "default" | "secondary" | "outline" {
  const v = s.toUpperCase();
  if (v === "OPEN") return "secondary";
  if (v === "INVESTIGATING") return "secondary";
  if (v === "RESOLVED") return "default";
  return "outline";
}

export function AtcPage() {
  const [telemetry, setTelemetry] = useState<TelemetryResponse[]>([]);
  const [telemetryPage, setTelemetryPage] = useState<PageResponse<TelemetryResponse> | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyResponse[]>([]);
  const [anomaliesPage, setAnomaliesPage] = useState<PageResponse<AnomalyResponse> | null>(null);
  const [selected, setSelected] = useState<TelemetryResponse | null>(null);
  const [weather, setWeather] = useState<WeatherDto | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [filterFlight, setFilterFlight] = useState("");
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);
  const [loadingAnomalies, setLoadingAnomalies] = useState(false);
  const [errorTelemetry, setErrorTelemetry] = useState<string | null>(null);
  const [errorAnomalies, setErrorAnomalies] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [telemetryPageIdx, setTelemetryPageIdx] = useState(0);
  const [anomaliesPageIdx, setAnomaliesPageIdx] = useState(0);

  const fetchTelemetry = async (page = 0) => {
    setLoadingTelemetry(true);
    setErrorTelemetry(null);
    try {
      const res = await atcService.listTelemetry({ flightNumber: filterFlight.trim() || undefined, page, size: 10 });
      if (isPageResponse<TelemetryResponse>(res)) {
        setTelemetry(res.content);
        setTelemetryPage(res);
        setTelemetryPageIdx(res.page);
      } else {
        setTelemetry(res as TelemetryResponse[]);
        setTelemetryPage(null);
      }
      // auto-select first if none selected
      if (!selected && Array.isArray(res) && res.length > 0) {
        // not paginated array case
        const first = (res as TelemetryResponse[])[0];
        if (first) setSelected(first);
      } else if (isPageResponse<TelemetryResponse>(res) && res.content.length > 0 && !selected) {
        setSelected(res.content[0]);
      }
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) setErrorTelemetry("Authentication required. Please login as ATC_EMPLOYEE.");
        else if (e.status === 403) setErrorTelemetry("Access denied — ATC_EMPLOYEE role required (backend enforces).");
        else setErrorTelemetry(e.message);
      } else setErrorTelemetry("Failed to load telemetry.");
    } finally {
      setLoadingTelemetry(false);
    }
  };

  const fetchAnomalies = async (page = 0) => {
    setLoadingAnomalies(true);
    setErrorAnomalies(null);
    try {
      const res = await atcService.listAnomalies({ flightNumber: filterFlight.trim() || undefined, page, size: 10 });
      if (isPageResponse<AnomalyResponse>(res)) {
        setAnomalies(res.content);
        setAnomaliesPage(res);
        setAnomaliesPageIdx(res.page);
      } else {
        setAnomalies(res as AnomalyResponse[]);
        setAnomaliesPage(null);
      }
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) setErrorAnomalies("Authentication required.");
        else if (e.status === 403) setErrorAnomalies("Access denied — ATC_EMPLOYEE role required.");
        else setErrorAnomalies(e.message);
      } else setErrorAnomalies("Failed to load anomalies.");
    } finally {
      setLoadingAnomalies(false);
    }
  };

  useEffect(() => {
    fetchTelemetry(0);
    fetchAnomalies(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected?.latitude != null && selected?.longitude != null) {
      setLoadingWeather(true);
      setWeatherError(null);
      setWeather(null);
      weatherService
        .getByCoordinates(selected.latitude, selected.longitude)
        .then(setWeather)
        .catch((e) => {
          if (e instanceof ApiError) setWeatherError(e.message);
          else setWeatherError("Weather unavailable.");
        })
        .finally(() => setLoadingWeather(false));
    } else {
      setWeather(null);
      setWeatherError(null);
    }
  }, [selected]);

  const handleFilter = () => {
    fetchTelemetry(0);
    fetchAnomalies(0);
  };

  const handleStatusUpdate = async (id: number, newStatus: string) => {
    setUpdatingId(id);
    try {
      const updated = await atcService.updateAnomalyStatus(id, newStatus);
      setAnomalies((prev) => prev.map((a) => (a.id === id ? updated : a)));
    } catch (e) {
      if (e instanceof ApiError) alert(`Status update failed: ${e.message}`);
      else alert("Status update failed.");
    } finally {
      setUpdatingId(null);
    }
  };

  const livePoint = selected?.latitude != null && selected?.longitude != null ? { lat: selected.latitude, lng: selected.longitude, label: selected.flightIata ?? selected.flightNumber, subLabel: selected.flightStatus ?? undefined } : null;
  const depPoint = null; // no departure coordinates in telemetryResponse, would require airport lookup by originIata
  const arrPoint = null;

  // For map, we could optionally fetch airport coords for origin/destination if needed, but spec says no fake coords — so only live point
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Radar className="size-6 text-primary" /> ATC Operations</h1>
        <p className="text-sm text-muted-foreground">Role-gated dashboard via <code className="bg-muted px-1 rounded">GET /api/atc/telemetry</code> + <code className="bg-muted px-1 rounded">GET /api/atc/anomalies</code> + <code className="bg-muted px-1 rounded">PATCH /api/atc/anomalies/{"{id}"}/status</code>. Backend authoritative.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Filter & connection</CardTitle>
          <CardDescription className="text-xs">Optional flight filter — backend supports <code className="bg-muted px-1 rounded">?flightNumber=</code>. Pagination via <code className="bg-muted px-1 rounded">page/size</code>.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="atc-flight">Flight number</Label>
            <Input id="atc-flight" placeholder="e.g., LH400" value={filterFlight} onChange={(e) => setFilterFlight(e.target.value)} className="w-[200px] font-mono" />
          </div>
          <Button onClick={handleFilter} className="gap-2"><RefreshCw className="size-4" /> Apply</Button>
          <Button variant="outline" onClick={() => { setFilterFlight(""); fetchTelemetry(0); fetchAnomalies(0); }}>Clear</Button>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${errorTelemetry || errorAnomalies ? "bg-destructive" : "bg-emerald-500"}`} /> {errorTelemetry || errorAnomalies ? "Error" : "Connected"}</span>
            {selected && <Badge variant="secondary" className="font-mono text-[11px]">{selected.flightNumber}</Badge>}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr] items-start">
        <div className="space-y-6">
          <TrackingMap live={livePoint} departure={depPoint} arrival={arrPoint} altitude={selected?.altitude} speed={selected?.speed} />
          <Alert>
            <Navigation className="size-4" />
            <AlertTitle className="text-xs">Historical path</AlertTitle>
            <AlertDescription className="text-xs">Backend provides only latest telemetry point per record (lat/lng + heading). Historical path data unavailable — no polyline fabricated. Map shows selected aircraft only.</AlertDescription>
          </Alert>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Gauge className="size-4" /> Selected telemetry</CardTitle>
              <CardDescription className="text-xs">{selected ? `ID ${selected.id} • ${selected.flightNumber}` : "Select a record below."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selected && <Alert><AlertCircle className="size-4" /><AlertTitle className="text-xs">No selection</AlertTitle><AlertDescription className="text-xs">Choose a telemetry record from the list below.</AlertDescription></Alert>}
              {selected && (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Flight</span><span className="font-mono font-medium">{selected.flightNumber} {selected.flightIata ? `(${selected.flightIata})` : ""}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">ICAO</span><span className="font-mono">{selected.flightIcao ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Airline</span><span>{selected.airlineIata ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Origin → Dest</span><span className="font-mono">{selected.originIata ?? "—"} → {selected.destinationIata ?? "—"}</span></div>
                  <Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><MapPin className="size-3" /> Lat/Lng</span><span className="font-mono">{selected.latitude != null && selected.longitude != null ? `${selected.latitude.toFixed(4)}, ${selected.longitude.toFixed(4)}` : "— (Live position unavailable)"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Altitude</span><span>{selected.altitude != null ? `${selected.altitude} ft` : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Speed</span><span>{selected.speed != null ? `${selected.speed} kts` : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Direction</span><span>{selected.direction != null ? `${selected.direction}°` : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Heading</span><span>{selected.heading != null ? `${selected.heading}°` : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="outline" className="text-[10px]">{selected.flightStatus ?? "—"}</Badge></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Route</span><span className="text-right max-w-[160px] truncate">{selected.routeInfo ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Aircraft</span><span className="font-mono">{selected.aircraftRegistration ?? "—"}</span></div>
                  <Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Clock className="size-3" /> Recorded</span><span>{selected.recordedAt ? new Date(selected.recordedAt).toLocaleString() : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(selected.createdAt).toLocaleString()}</span></div>
                  {!selected.latitude && <Alert><AlertCircle className="size-4" /><AlertTitle className="text-xs">Live position unavailable</AlertTitle><AlertDescription className="text-xs">This record has no coordinates — map shows empty state, not fabricated.</AlertDescription></Alert>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Thermometer className="size-4" /> Weather at position</CardTitle>
              <CardDescription className="text-xs">Via <code className="bg-muted px-1 rounded">GET /api/weather?latitude&longitude</code></CardDescription>
            </CardHeader>
            <CardContent>
              {!selected && <p className="text-xs text-muted-foreground">Select a telemetry record.</p>}
              {selected && (selected.latitude == null || selected.longitude == null) && <p className="text-xs text-muted-foreground">No coordinates — weather unavailable.</p>}
              {selected && selected.latitude != null && selected.longitude != null && (
                <>
                  {loadingWeather && <Skeleton className="h-16 w-full" />}
                  {weatherError && <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Weather error</AlertTitle><AlertDescription className="text-xs">{weatherError}</AlertDescription></Alert>}
                  {!loadingWeather && weather && (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border bg-muted/20 p-2"><div className="text-muted-foreground flex items-center gap-1"><Thermometer className="size-3" /> Temp</div><div className="font-semibold">{weather.temperature}°C</div><div className="text-muted-foreground">{weather.weatherCondition ?? "—"}</div></div>
                      <div className="rounded-lg border p-2"><div className="text-muted-foreground flex items-center gap-1"><Wind className="size-3" /> Wind</div><div className="font-semibold">{weather.windSpeed ?? "—"} km/h</div></div>
                      <div className="rounded-lg border p-2"><div className="text-muted-foreground flex items-center gap-1"><Droplets className="size-3" /> Precip</div><div className="font-semibold">{weather.precipitation ?? "—"} mm</div></div>
                      <div className="rounded-lg border p-2"><div className="text-muted-foreground">Humidity</div><div className="font-semibold">{weather.humidity ?? "—"}%</div></div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs defaultValue="telemetry">
        <TabsList>
          <TabsTrigger value="telemetry" className="gap-1.5"><Plane className="size-3.5" /> Telemetry {telemetryPage ? `(${telemetryPage.totalElements})` : telemetry.length ? `(${telemetry.length})` : ""}</TabsTrigger>
          <TabsTrigger value="anomalies" className="gap-1.5"><ShieldAlert className="size-3.5" /> Anomalies {anomaliesPage ? `(${anomaliesPage.totalElements})` : anomalies.length ? `(${anomalies.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="telemetry" className="mt-4 space-y-3">
          {loadingTelemetry && <Skeleton className="h-32 w-full" />}
          {errorTelemetry && <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Telemetry error</AlertTitle><AlertDescription className="text-xs">{errorTelemetry}</AlertDescription></Alert>}
          {!loadingTelemetry && telemetry.length === 0 && !errorTelemetry && (
            <Alert><AlertCircle className="size-4" /><AlertTitle>No telemetry</AlertTitle><AlertDescription className="text-xs">No records. Create via <code className="bg-background px-1 rounded border">POST /api/atc/telemetry</code> (ATC only) or adjust filter.</AlertDescription></Alert>
          )}
          {telemetry.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Flight</TableHead>
                        <TableHead className="text-xs">Origin→Dest</TableHead>
                        <TableHead className="text-xs">Pos</TableHead>
                        <TableHead className="text-xs">Alt/Speed</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {telemetry.map((t) => (
                        <TableRow key={t.id} className={selected?.id === t.id ? "bg-muted/50" : ""}>
                          <TableCell className="font-mono text-xs">{t.flightNumber}<div className="text-[11px] text-muted-foreground">{t.flightIata ?? ""}</div></TableCell>
                          <TableCell className="text-xs font-mono">{t.originIata ?? "—"}→{t.destinationIata ?? "—"}</TableCell>
                          <TableCell className="text-xs">{t.latitude != null && t.longitude != null ? `${t.latitude.toFixed(2)},${t.longitude.toFixed(2)}` : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-xs">{t.altitude ?? "—"} / {t.speed ?? "—"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{t.flightStatus ?? "—"}</Badge></TableCell>
                          <TableCell><Button size="sm" variant={selected?.id === t.id ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setSelected(t)}>Select</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
          {telemetryPage && telemetryPage.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 text-xs">
              <Button variant="outline" size="sm" disabled={telemetryPageIdx === 0} onClick={() => fetchTelemetry(telemetryPageIdx - 1)}>Prev</Button>
              <span>Page {telemetryPage.page + 1} / {telemetryPage.totalPages}</span>
              <Button variant="outline" size="sm" disabled={telemetryPage.last} onClick={() => fetchTelemetry(telemetryPageIdx + 1)}>Next</Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="anomalies" className="mt-4 space-y-3">
          {loadingAnomalies && <Skeleton className="h-32 w-full" />}
          {errorAnomalies && <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Anomalies error</AlertTitle><AlertDescription className="text-xs">{errorAnomalies}</AlertDescription></Alert>}
          {!loadingAnomalies && anomalies.length === 0 && !errorAnomalies && (
            <Alert><AlertCircle className="size-4" /><AlertTitle>No anomalies</AlertTitle><AlertDescription className="text-xs">No anomaly records. Backend provides real data only.</AlertDescription></Alert>
          )}
          {anomalies.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Flight</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Severity</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="text-xs">Update</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {anomalies.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-mono text-xs">{a.flightNumber}<div className="text-[11px] text-muted-foreground">{a.flightIata ?? ""}</div></TableCell>
                          <TableCell className="text-xs">{a.anomalyType}</TableCell>
                          <TableCell><Badge variant={severityVariant(a.severity)} className="text-[10px]">{a.severity}</Badge></TableCell>
                          <TableCell><Badge variant={statusVariant(a.status)} className="text-[10px]">{a.status}</Badge></TableCell>
                          <TableCell className="text-xs max-w-[220px] truncate" title={a.description ?? ""}>{a.description ?? "—"}</TableCell>
                          <TableCell>
                            <Select value={a.status} onValueChange={(v) => handleStatusUpdate(a.id, v ?? a.status)} disabled={updatingId === a.id}>
                              <SelectTrigger className="w-[160px] h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="OPEN">OPEN</SelectItem>
                                <SelectItem value="INVESTIGATING">INVESTIGATING</SelectItem>
                                <SelectItem value="RESOLVED">RESOLVED</SelectItem>
                                <SelectItem value="FALSE_POSITIVE">FALSE_POSITIVE</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
          {anomaliesPage && anomaliesPage.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 text-xs">
              <Button variant="outline" size="sm" disabled={anomaliesPageIdx === 0} onClick={() => fetchAnomalies(anomaliesPageIdx - 1)}>Prev</Button>
              <span>Page {anomaliesPage.page + 1} / {anomaliesPage.totalPages}</span>
              <Button variant="outline" size="sm" disabled={anomaliesPage.last} onClick={() => fetchAnomalies(anomaliesPageIdx + 1)}>Next</Button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">PATCH via <code className="bg-muted px-1 rounded">/api/atc/anomalies/{"{id}"}/status</code> with <code className="bg-muted px-1 rounded">{"{ status }"}</code> body. Frontend shows real <code className="bg-muted px-1 rounded">AnomalySeverity</code> + <code className="bg-muted px-1 rounded">AnomalyStatus</code> enums.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}


