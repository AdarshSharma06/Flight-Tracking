import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { airportService, type AirportFlightsResponse } from "@/services/airport.service";
import { weatherService } from "@/services/weather.service";
import { aiService } from "@/services/ai.service";
import { ApiError } from "@/services/api";
import type { AirportDto, FlightDto, WeatherDto } from "@/types/api";
import { AirportMap } from "@/components/airports/AirportMap";
import { Loader2, ArrowLeft, PlaneTakeoff, PlaneLanding, Globe, Building2, MapPin, Thermometer, Wind, Droplets, AlertCircle, Clock, Sparkles, Send, Bot, Map, Terminal } from "lucide-react";

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

  // AI assistant state
  const [aiMessages, setAiMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiConversationId, setAiConversationId] = useState<string | undefined>(undefined);

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
    Promise.all([
      airportService.getDepartures(code, 10).catch((e) => e),
      airportService.getArrivals(code, 10).catch((e) => e),
    ])
      .then(([dep, arr]) => {
        if (dep instanceof Error) {
          if (dep instanceof ApiError) setFlightsError(dep.message);
        } else {
          setDepartures(dep as AirportFlightsResponse);
        }
        if (arr instanceof Error) {
          if (arr instanceof ApiError) setFlightsError((prev) => (prev ? `${prev} • ${arr.message}` : arr.message));
        } else {
          setArrivals(arr as AirportFlightsResponse);
        }
      })
      .finally(() => setLoadingFlights(false));

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

  const handleAiSend = async () => {
    const msg = aiInput.trim();
    if (!msg || aiLoading) return;
    setAiInput("");
    setAiMessages((prev) => [...prev, { role: "user", content: msg }]);
    setAiLoading(true);
    setAiError(null);
    try {
      const contextMsg = code ? `[Airport context: ${code}] ${msg}` : msg;
      const res = await aiService.chat(contextMsg, aiConversationId);
      setAiConversationId(res.conversationId);
      setAiMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
    } catch (e) {
      if (e instanceof ApiError) {
        setAiError(e.status === 401 ? "Session expired. Please log in." : e.message);
      } else {
        setAiError("AI assistant unavailable.");
      }
    } finally {
      setAiLoading(false);
    }
  };

  if (!code || !/^[A-Z]{3}$/.test(code)) {
    return (
      <div className="w-full min-h-[100dvh] pt-20 bg-background flex items-center justify-center p-6">
        <div className="glass-panel rounded-xl p-6 flex items-center gap-3 border border-destructive/30 bg-destructive/10">
          <AlertCircle className="size-5 text-destructive" />
          <span className="text-sm text-destructive">Invalid IATA — use a 3-letter code like DEL.</span>
        </div>
      </div>
    );
  }

  if (loadingAirport) {
    return (
      <div className="w-full min-h-[100dvh] pt-20 bg-background flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (airportError || !airport) {
    return (
      <div className="w-full min-h-[100dvh] pt-20 bg-background flex flex-col items-center justify-center gap-4 p-6">
        <div className="glass-panel rounded-xl p-6 text-center space-y-3">
          <AlertCircle className="size-8 text-destructive mx-auto" />
          <p className="text-sm text-destructive">{airportError ?? "Airport not found."}</p>
          <Link to="/airports" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest font-semibold text-primary hover:text-primary/80">
            <ArrowLeft className="size-3" /> Back to Directory
          </Link>
        </div>
      </div>
    );
  }

  const hasCoords = airport.latitude != null && airport.longitude != null;

  return (
    <div className="w-full min-h-[100dvh] pt-20 pb-12 bg-background">
      <div className="w-[88%] max-w-[1600px] mx-auto px-2 lg:px-0 space-y-6">
        {/* Breadcrumb */}
        <Link to="/airports" className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="size-3" /> Airports
          <span className="text-white/20">/</span>
          <span className="font-mono text-white">{code}</span>
        </Link>

        {/* Airport header + info/map grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[42%_58%] gap-6 items-start">
          {/* LEFT — Airport Information */}
          <div className="glass-panel rounded-xl p-5 lg:p-6 space-y-5 min-w-0">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-3xl lg:text-4xl font-mono font-semibold tracking-tight text-white uppercase">{airport.iata}</h1>
                {airport.icao && (
                  <span className="px-2 py-0.5 rounded border border-white/15 bg-white/5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {airport.icao}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded bg-primary/15 border border-primary/20 text-primary font-mono text-[10px] uppercase tracking-widest">
                  {airport.countryIso2 ?? airport.country ?? "—"}
                </span>
              </div>
              <p className="text-base lg:text-lg text-white/90 leading-tight">{airport.name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <MapPin className="size-3" />
                {airport.city ?? "—"}
                {airport.country ? `, ${airport.country}` : ""} • <Globe className="size-3" /> {airport.timezone ?? "—"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
              <DataBlock label="City" value={airport.city} />
              <DataBlock label="Country" value={airport.country} />
              <DataBlock label="Timezone" value={airport.timezone} />
              <DataBlock label="ICAO" value={airport.icao} mono />
              <DataBlock label="Latitude" value={airport.latitude != null ? airport.latitude.toFixed(4) : null} mono />
              <DataBlock label="Longitude" value={airport.longitude != null ? airport.longitude.toFixed(4) : null} mono />
              <DataBlock label="Coordinates" value={hasCoords ? `${airport.latitude!.toFixed(3)}, ${airport.longitude!.toFixed(3)}` : null} mono span={2} />
            </div>
          </div>

          {/* RIGHT — Google Map */}
          <div className="glass-panel rounded-xl overflow-hidden border border-white/10 min-w-0">
            <div className="h-[320px] lg:h-[380px] w-full relative bg-[#0a0f1a]">
              {hasCoords ? (
                <AirportMap
                  latitude={airport.latitude!}
                  longitude={airport.longitude!}
                  label={`${airport.iata} — ${airport.name}`}
                  className="h-full w-full"
                />
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-white/[0.02] p-6 text-center">
                  <Building2 className="size-8 text-white/20" />
                  <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">No coordinates for map</p>
                  <p className="text-xs text-muted-foreground">{airport.name}</p>
                </div>
              )}
            </div>
            {hasCoords && (
              <div className="px-3 py-2 flex items-center justify-between border-t border-white/5 bg-white/[0.02]">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> Google Maps • {airport.iata}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {airport.latitude!.toFixed(3)}, {airport.longitude!.toFixed(3)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Weather */}
        <div className="glass-panel rounded-xl p-4 lg:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Thermometer className="size-4 text-primary" />
            <h2 className="text-xs uppercase tracking-[0.16em] font-semibold text-white">Current weather</h2>
            <span className="text-[11px] text-muted-foreground font-mono hidden sm:inline">• {airport.iata}</span>
          </div>

          {loadingWeather && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[86px] rounded-lg bg-white/5 animate-pulse border border-white/5" />
              ))}
            </div>
          )}

          {weatherError && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 flex items-start gap-2">
              <AlertCircle className="size-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-amber-400">Weather temporarily unavailable</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{weatherError}</p>
              </div>
            </div>
          )}

          {!loadingWeather && !weatherError && weather && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <WeatherCard icon={<Thermometer className="size-3" />} label="Temperature" value={`${weather.temperature}°C`} sub={`${weather.weatherCondition ?? "—"} ${weather.weatherCode != null ? `(${weather.weatherCode})` : ""}`} sub2={`Feels ${weather.apparentTemperature ?? "—"}°C`} />
              <WeatherCard icon={<Wind className="size-3" />} label="Wind" value={`${weather.windSpeed ?? "—"} km/h`} sub={`Precip ${weather.precipitation ?? "—"} mm`} />
              <WeatherCard icon={<Droplets className="size-3" />} label="Humidity" value={`${weather.humidity ?? "—"}%`} sub={`Timezone ${weather.timezone ?? "—"}`} />
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Observation</div>
                <div className="text-xs font-mono text-white leading-tight truncate">{weather.observationTime ? new Date(weather.observationTime).toLocaleString() : "—"}</div>
                <div className="text-xs text-muted-foreground">{weather.timezone ?? ""}</div>
              </div>
            </div>
          )}

          {!loadingWeather && !weather && !weatherError && (
            <p className="text-xs text-muted-foreground">No weather data.</p>
          )}
        </div>

        {/* Departures & Arrivals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <FlightPanel
            title="Departures"
            icon={<PlaneTakeoff className="size-3.5 text-primary" />}
            flights={departures}
            type="departure"
            loading={loadingFlights}
            error={flightsError}
          />
          <FlightPanel
            title="Arrivals"
            icon={<PlaneLanding className="size-3.5 text-primary" />}
            flights={arrivals}
            type="arrival"
            loading={loadingFlights}
            error={null}
          />
        </div>

        {/* Airport Explorer — Phase 1 Foundation */}
        <div className="glass-panel rounded-xl p-5 lg:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Map className="size-4 text-primary" />
            <h2 className="text-xs uppercase tracking-[0.16em] font-semibold text-white">Airport Explorer</h2>
            <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[9px] font-mono uppercase tracking-widest">Phase 1</span>
          </div>
          <p className="text-xs text-muted-foreground">Interactive airport terminal map and facilities — coming in Phase 2.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ExplorerPlaceholder icon={<Terminal className="size-5" />} label="Terminals" />
            <ExplorerPlaceholder icon={<MapPin className="size-5" />} label="Gates" />
            <ExplorerPlaceholder icon={<Building2 className="size-5" />} label="Lounges" />
            <ExplorerPlaceholder icon={<PlaneTakeoff className="size-5" />} label="Runways" />
          </div>
        </div>

        {/* AI Assistant */}
        <div className="glass-panel rounded-xl p-5 lg:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="text-xs uppercase tracking-[0.16em] font-semibold text-white">Airport Assistant</h2>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Bot className="size-3 text-primary" /> Ask about {code} — flights, weather, facilities, and more.
          </p>

          {/* Chat messages */}
          {aiMessages.length > 0 && (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {aiMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary/20 text-white border border-primary/20"
                      : "bg-white/[0.05] text-white/90 border border-white/10"
                  }`}>
                    {msg.role === "assistant" && (
                      <div className="flex items-center gap-1 mb-1 text-[10px] text-primary font-semibold uppercase tracking-widest">
                        <Bot className="size-3" /> Assistant
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 flex items-center gap-2">
                    <Loader2 className="size-3 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {aiError && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 flex gap-2">
              <AlertCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
              <span className="text-xs text-destructive">{aiError}</span>
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2">
            <input
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleAiSend())}
              placeholder={`Ask about ${code} airport...`}
              disabled={aiLoading}
              className="flex-1 h-9 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs text-white placeholder:text-muted-foreground focus:border-primary/40 focus:ring-1 focus:ring-primary/30 outline-none disabled:opacity-50"
            />
            <button
              onClick={handleAiSend}
              disabled={aiLoading || !aiInput.trim()}
              className="h-9 px-3 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Send className="size-3.5" />
            </button>
          </div>

          {aiMessages.length === 0 && !aiLoading && (
            <div className="flex flex-wrap gap-2">
              {[
                `What airlines fly from ${code}?`,
                `Weather at ${code} right now?`,
                `Best lounges at ${code}?`,
                `Getting from ${code} to city center`,
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => { setAiInput(prompt); }}
                  className="text-[10px] px-2.5 py-1 rounded-lg border border-white/10 bg-white/[0.03] text-muted-foreground hover:text-white hover:border-white/20 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DataBlock({ label, value, mono, span }: { label: string; value: unknown; mono?: boolean; span?: number }) {
  const display = value == null || value === "" ? "—" : String(value);
  return (
    <div className={span === 2 ? "col-span-2 space-y-1" : "space-y-1"}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className={`text-xs truncate ${mono ? "font-mono text-white" : "text-white"}`}>{display}</p>
    </div>
  );
}

function WeatherCard({ icon, label, value, sub, sub2 }: { icon: React.ReactNode; label: string; value: string; sub?: string; sub2?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-1">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-lg font-mono font-semibold text-white leading-none">{value}</div>
      {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
      {sub2 && <div className="text-xs text-muted-foreground">{sub2}</div>}
    </div>
  );
}

function FlightPanel({ title, icon, flights, type, loading, error }: { title: string; icon: React.ReactNode; flights: AirportFlightsResponse | null; type: "departure" | "arrival"; loading: boolean; error: string | null }) {
  return (
    <div className="glass-panel rounded-xl p-4 space-y-3 min-w-0">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-[0.16em] font-semibold text-white flex items-center gap-2">
          {icon} {title} {flights ? <span className="text-muted-foreground font-normal">({flights.count})</span> : null}
        </h3>
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hidden sm:inline">10 flights</span>
      </div>
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-9 rounded bg-white/5 animate-pulse" />
          ))}
        </div>
      )}
      {error && !loading && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 flex items-start gap-2">
          <AlertCircle className="size-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-amber-400">Flight data temporarily unavailable</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{error}</p>
          </div>
        </div>
      )}
      {!loading && !error && flights && flights.flights.length === 0 && (
        <p className="text-xs text-muted-foreground py-8 text-center font-mono">No {type === "departure" ? "departures" : "arrivals"} found.</p>
      )}
      {!loading && !error && flights && flights.flights.length > 0 && (
        <CompactFlightTable flights={flights.flights} type={type} />
      )}
      {!loading && !error && !flights && (
        <p className="text-xs text-muted-foreground py-8 text-center font-mono">Loading...</p>
      )}
    </div>
  );
}

function CompactFlightTable({ flights, type }: { flights: FlightDto[]; type: "departure" | "arrival" }) {
  const formatTime = (v: string | null) => {
    if (!v) return "—";
    const d = new Date(v);
    if (!isNaN(d.getTime())) {
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      return `${hh}:${mm}Z`;
    }
    return String(v).slice(11, 16) || "—";
  };

  return (
    <div className="overflow-hidden rounded-lg border border-white/10">
      <div className="grid grid-cols-[1.2fr_1.1fr_0.7fr_0.8fr_0.8fr] gap-2 px-3 py-2 bg-white/[0.03] border-b border-white/10 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
        <div>Flight</div>
        <div>Airline</div>
        <div>{type === "departure" ? "To" : "From"}</div>
        <div>Scheduled</div>
        <div className="text-right">Status</div>
      </div>
      <div className="divide-y divide-white/5">
        {flights.slice(0, 10).map((f) => {
          const key = f.flightNumber ?? f.flightIata ?? `${f.airlineIata}-${f.departureIata}-${f.arrivalIata}-${Math.random()}`;
          const dest = type === "departure" ? f.arrivalIata ?? "—" : f.departureIata ?? "—";
          const time = type === "departure" ? f.departureScheduled : f.arrivalScheduled;
          return (
            <Link
              key={key}
              to={`/tracking?flight_iata=${encodeURIComponent(f.flightIata ?? f.flightNumber ?? "")}`}
              className="grid grid-cols-[1.2fr_1.1fr_0.7fr_0.8fr_0.8fr] gap-2 px-3 py-2 items-center hover:bg-white/[0.04] transition-colors group"
            >
              <div className="font-mono text-xs font-semibold text-white truncate group-hover:text-primary transition-colors">
                {f.flightIata ?? f.flightNumber ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground truncate">{f.airlineName ?? f.airlineIata ?? "—"}</div>
              <div className="font-mono text-xs text-white/90">{dest}</div>
              <div className="font-mono text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="size-3 shrink-0 opacity-60" />
                {formatTime(time)}
              </div>
              <div className="text-right">
                <span
                  className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-widest border ${
                    (f.status ?? "").toLowerCase() === "active"
                      ? "bg-primary/15 text-primary border-primary/20"
                      : (f.status ?? "").toLowerCase() === "landed"
                        ? "bg-white/5 text-white/70 border-white/10"
                        : "bg-white/5 text-muted-foreground border-white/10"
                  }`}
                >
                  {f.status ?? "Scheduled"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ExplorerPlaceholder({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-4 flex flex-col items-center justify-center gap-2 opacity-50">
      <div className="text-white/30">{icon}</div>
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
    </div>
  );
}
