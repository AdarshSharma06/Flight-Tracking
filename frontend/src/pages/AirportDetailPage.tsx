import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { airportService, type AirportFlightsResponse } from "@/services/airport.service";
import { weatherService } from "@/services/weather.service";
import { ApiError } from "@/services/api";
import type { AirportDto, FlightDto, WeatherDto } from "@/types/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { TrackingMap } from "@/components/tracking/TrackingMap";
import { Building2, MapPin, Thermometer, Wind, Droplets, AlertCircle, Plane, Clock, Navigation } from "lucide-react";

export function AirportDetailPage() {
  const { iata } = useParams<{ iata: string }>();
  const code = (iata ?? "").toUpperCase();

  const [airport, setAirport] = useState<AirportDto | null>(null);
  const [loadingAirport, setLoadingAirport] = useState(true);
  const [airportError, setAirportError] = useState<string | null>(null);

  const [departures, setDepartures] = useState<AirportFlightsResponse | null>(null);
  const [arrivals, setArrivals] = useState<AirportFlightsResponse | null>(null);
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [flightsError, setFlightsError] = useState<string | null>(null);

  const [weather, setWeather] = useState<WeatherDto | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  useEffect(() => {
    if (!code || !/^[A-Z]{3}$/.test(code)) {
      setAirportError("Invalid IATA code.");
      setLoadingAirport(false);
      return;
    }
    setLoadingAirport(true);
    setAirportError(null);
    airportService
      .getByIata(code)
      .then(setAirport)
      .catch((e) => {
        if (e instanceof ApiError) setAirportError(e.message);
        else setAirportError("Failed to load airport.");
      })
      .finally(() => setLoadingAirport(false));

    setLoadingFlights(true);
    setFlightsError(null);
    Promise.all([airportService.getDepartures(code, 10).catch((e) => e), airportService.getArrivals(code, 10).catch((e) => e)]).then(([dep, arr]) => {
      if (dep instanceof Error) {
        // Check if ApiError
        if (dep instanceof ApiError) setFlightsError(dep.message);
      } else {
        setDepartures(dep as AirportFlightsResponse);
      }
      if (arr instanceof Error) {
        if (arr instanceof ApiError) setFlightsError((prev) => prev ? `${prev} • ${arr.message}` : arr.message);
      } else {
        setArrivals(arr as AirportFlightsResponse);
      }
    }).finally(() => setLoadingFlights(false));

    setLoadingWeather(true);
    setWeatherError(null);
    weatherService
      .getByAirport(code)
      .then(setWeather)
      .catch((e) => {
        if (e instanceof ApiError) setWeatherError(e.message);
        else setWeatherError("Weather unavailable.");
      })
      .finally(() => setLoadingWeather(false));
  }, [code]);

  if (!code || !/^[A-Z]{3}$/.test(code)) {
    return (
      <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Invalid IATA</AlertTitle><AlertDescription>Use a 3-letter code like DEL.</AlertDescription></Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink render={<Link to="/airports" />}>Airports</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage className="font-mono">{code}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Airport header */}
      <Card>
        <CardHeader>
          {loadingAirport ? (
            <Skeleton className="h-6 w-40" />
          ) : airportError ? (
            <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Airport error</AlertTitle><AlertDescription className="text-xs">{airportError}</AlertDescription></Alert>
          ) : airport ? (
            <>
              <CardTitle className="flex items-center gap-2 text-xl"><Building2 className="size-5 text-primary" /> {airport.name} <Badge variant="secondary" className="font-mono">{airport.iata}</Badge> {airport.icao && <Badge variant="outline" className="font-mono text-[10px]">{airport.icao}</Badge>}</CardTitle>
              <CardDescription className="flex flex-wrap gap-2 text-xs">
                <span className="flex items-center gap-1"><MapPin className="size-3" />{airport.city ?? "—"}{airport.country ? `, ${airport.country}` : ""} {airport.countryIso2 ? `(${airport.countryIso2})` : ""}</span>
                <span>• {airport.timezone ?? "—"}</span>
                <span>• {airport.latitude != null && airport.longitude != null ? `${airport.latitude.toFixed(3)}, ${airport.longitude.toFixed(3)}` : "no coordinates"}</span>
              </CardDescription>
            </>
          ) : null}
        </CardHeader>
        {airport && !loadingAirport && (
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">IATA</span><span className="font-mono font-medium">{airport.iata}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">ICAO</span><span className="font-mono">{airport.icao ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">City</span><span>{airport.city ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Country</span><span>{airport.country ?? "—"}</span></div>
            </div>
            <div>
              {airport.latitude != null && airport.longitude != null ? (
                <TrackingMap
                  departure={{ lat: airport.latitude, lng: airport.longitude, label: airport.name, subLabel: `${airport.iata} • ${airport.city ?? ""}` }}
                  className="min-h-[180px]"
                />
              ) : (
                <div className="rounded-xl border bg-muted/20 flex items-center justify-center min-h-[180px] text-xs text-muted-foreground">No coordinates for map.</div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Weather */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Thermometer className="size-4" /> Current weather <span className="text-xs font-normal text-muted-foreground">via <code className="bg-muted px-1 rounded">GET /api/weather/airport/{"{iata}"}</code></span></CardTitle>
        </CardHeader>
        <CardContent>
          {loadingWeather && <Skeleton className="h-16 w-full" />}
          {weatherError && <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Weather error</AlertTitle><AlertDescription className="text-xs">{weatherError}</AlertDescription></Alert>}
          {!loadingWeather && weather && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="rounded-lg border bg-muted/20 p-3 space-y-1"><div className="text-muted-foreground flex items-center gap-1"><Thermometer className="size-3" /> Temperature</div><div className="text-lg font-semibold">{weather.temperature}°C</div><div className="text-muted-foreground">{weather.weatherCondition ?? "—"} {weather.weatherCode != null ? `(${weather.weatherCode})` : ""}</div></div>
              <div className="rounded-lg border p-3 space-y-1"><div className="text-muted-foreground flex items-center gap-1"><Wind className="size-3" /> Wind</div><div className="text-lg font-semibold">{weather.windSpeed ?? "—"} km/h</div><div className="text-muted-foreground">Precip {weather.precipitation ?? "—"} mm</div></div>
              <div className="rounded-lg border p-3 space-y-1"><div className="text-muted-foreground flex items-center gap-1"><Droplets className="size-3" /> Humidity</div><div className="text-lg font-semibold">{weather.humidity ?? "—"}%</div><div className="text-muted-foreground">Feels {weather.apparentTemperature ?? "—"}°C</div></div>
              <div className="rounded-lg border p-3 space-y-1"><div className="text-muted-foreground">Timezone</div><div className="text-sm font-medium">{weather.timezone ?? "—"}</div><div className="text-muted-foreground">{weather.observationTime ? new Date(weather.observationTime).toLocaleString() : ""}</div></div>
            </div>
          )}
          {!loadingWeather && !weather && !weatherError && <p className="text-xs text-muted-foreground">No weather data.</p>}
        </CardContent>
      </Card>

      {/* Flights */}
      <Tabs defaultValue="departures">
        <TabsList>
          <TabsTrigger value="departures" className="gap-1.5"><Navigation className="size-3.5" /> Departures {departures ? `(${departures.count})` : ""}</TabsTrigger>
          <TabsTrigger value="arrivals" className="gap-1.5"><Plane className="size-3.5" /> Arrivals {arrivals ? `(${arrivals.count})` : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="departures" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription className="text-xs">Via <code className="bg-muted px-1 rounded">GET /api/airports/{"{iata}"}/departures?limit=10</code></CardDescription></CardHeader>
            <CardContent>
              {loadingFlights && <Skeleton className="h-32 w-full" />}
              {flightsError && <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Flights error</AlertTitle><AlertDescription className="text-xs">{flightsError}</AlertDescription></Alert>}
              {!loadingFlights && departures && departures.flights.length === 0 && <p className="text-xs text-muted-foreground">No departures found.</p>}
              {departures && departures.flights.length > 0 && <FlightsTable flights={departures.flights} />}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="arrivals" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription className="text-xs">Via <code className="bg-muted px-1 rounded">GET /api/airports/{"{iata}"}/arrivals?limit=10</code></CardDescription></CardHeader>
            <CardContent>
              {loadingFlights && <Skeleton className="h-32 w-full" />}
              {!loadingFlights && arrivals && arrivals.flights.length === 0 && <p className="text-xs text-muted-foreground">No arrivals found.</p>}
              {arrivals && arrivals.flights.length > 0 && <FlightsTable flights={arrivals.flights} />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-center"><Link to="/airports" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Back to search</Link></div>
    </div>
  );
}

function FlightsTable({ flights }: { flights: FlightDto[] }) {
  return (
    <div className="rounded-md border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Flight</TableHead>
              <TableHead className="text-xs">Airline</TableHead>
              <TableHead className="text-xs">Destination/Origin</TableHead>
              <TableHead className="text-xs">Scheduled</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flights.map((f) => (
              <TableRow key={f.flightNumber ?? f.flightIata ?? Math.random().toString()}>
                <TableCell className="font-mono text-xs">{f.flightIata ?? f.flightNumber ?? "—"}</TableCell>
                <TableCell className="text-xs">{f.airlineName ?? f.airlineIata ?? "—"}</TableCell>
                <TableCell className="text-xs">{f.arrivalIata ?? f.departureIata ?? "—"} <span className="text-muted-foreground">{f.arrivalAirport ?? f.departureAirport ?? ""}</span></TableCell>
                <TableCell className="text-xs"><span className="flex items-center gap-1"><Clock className="size-3" />{f.departureScheduled ?? f.arrivalScheduled ?? "—"}</span></TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{f.status ?? "—"}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
