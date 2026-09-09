import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { airportService, type AirportFlightsResponse } from "@/services/airport.service";
import { weatherService } from "@/services/weather.service";
import { aiService } from "@/services/ai.service";
import { ApiError } from "@/services/api";
import type { AirportDto, FlightDto, WeatherDto, AirportExplorerData } from "@/types/api";
import { AirportExplorer } from "@/components/airports/AirportExplorer";
import { Loader2, ArrowLeft, PlaneTakeoff, PlaneLanding, Globe, MapPin, Thermometer, Wind, Droplets, AlertCircle, Clock, Sparkles, Send, Bot } from "lucide-react";

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

  const [explorer, setExplorer] = useState<AirportExplorerData | null>(null);
  const [loadingExplorer, setLoadingExplorer] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);

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

    setLoadingExplorer(true);
    setExplorerError(null);
    airportService
      .getExplorer(code)
      .then(setExplorer)
      .catch((e) => {
        if (e instanceof ApiError) setExplorerError(e.message);
        else setExplorerError("Explorer data unavailable.");
      })
      .finally(() => setLoadingExplorer(false));
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

  return (
    <div className="w-full min-h-[100dvh] pt-20 pb-12 bg-background">
      <div className="w-[88%] max-w-[1600px] mx-auto px-2 lg:px-0 space-y-4">
        {/* Breadcrumb */}
        <Link to="/airports" className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="size-3" /> Airports
          <span className="text-white/20">/</span>
          <span className="font-mono text-white">{code}</span>
        </Link>

        {/* Compact Airport Header */}
        <div className="glass-panel rounded-xl px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl lg:text-3xl font-mono font-semibold tracking-tight text-white uppercase">{airport.iata}</h1>
            {airport.icao && (
              <span className="px-1.5 py-0.5 rounded border border-white/15 bg-white/5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {airport.icao}
              </span>
            )}
            <span className="px-1.5 py-0.5 rounded bg-primary/15 border border-primary/20 text-primary font-mono text-[10px] uppercase tracking-widest">
              {airport.countryIso2 ?? airport.country ?? "—"}
            </span>
          </div>
          <div className="text-sm text-white/80 truncate">{airport.name}</div>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground ml-auto">
            <span className="flex items-center gap-1"><MapPin className="size-3" /> {airport.city ?? "—"}</span>
            <span className="flex items-center gap-1"><Globe className="size-3" /> {airport.timezone ?? "—"}</span>
            {airport.latitude != null && airport.longitude != null && (
              <span className="font-mono">{airport.latitude.toFixed(3)}, {airport.longitude.toFixed(3)}</span>
            )}
          </div>
        </div>

        {/* Main 60/40 Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 items-start">
          {/* LEFT — Airport Explorer */}
          <div className="min-h-[500px] lg:min-h-[600px]">
            {airport.latitude != null && airport.longitude != null ? (
              <AirportExplorer
                data={explorer}
                loading={loadingExplorer}
                error={explorerError}
                latitude={airport.latitude}
                longitude={airport.longitude}
                iata={code}
              />
            ) : (
              <div className="glass-panel rounded-xl h-full min-h-[500px] flex flex-col items-center justify-center gap-2">
                <MapPin className="size-8 text-white/20" />
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">No coordinates for explorer</p>
              </div>
            )}
          </div>

          {/* RIGHT — Info Column */}
          <div className="space-y-4">
            {/* Weather */}
            <div className="glass-panel rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Thermometer className="size-3.5 text-primary" />
                <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-white">Weather</h2>
                <span className="text-[10px] text-muted-foreground font-mono">{airport.iata}</span>
              </div>

              {loadingWeather && (
                <div className="grid grid-cols-2 gap-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-14 rounded-lg bg-white/5 animate-pulse border border-white/5" />
                  ))}
                </div>
              )}

              {weatherError && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 flex items-start gap-2">
                  <AlertCircle className="size-3 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground line-clamp-1">{weatherError}</p>
                </div>
              )}

              {!loadingWeather && !weatherError && weather && (
                <div className="grid grid-cols-2 gap-2">
                  <CompactWeatherItem icon={<Thermometer className="size-3" />} label="Temp" value={`${weather.temperature}°`} sub={weather.weatherCondition ?? "—"} />
                  <CompactWeatherItem icon={<Wind className="size-3" />} label="Wind" value={`${weather.windSpeed ?? "—"} km/h`} />
                  <CompactWeatherItem icon={<Droplets className="size-3" />} label="Humidity" value={`${weather.humidity ?? "—"}%`} />
                  <CompactWeatherItem icon={<Clock className="size-3" />} label="Observed" value={weather.observationTime ? new Date(weather.observationTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"} />
                </div>
              )}

              {!loadingWeather && !weather && !weatherError && (
                <p className="text-[10px] text-muted-foreground">No weather data.</p>
              )}
            </div>

            {/* Departures */}
            <CompactFlightPanel
              title="Departures"
              icon={<PlaneTakeoff className="size-3 text-primary" />}
              flights={departures}
              type="departure"
              loading={loadingFlights}
              error={flightsError}
            />

            {/* Arrivals */}
            <CompactFlightPanel
              title="Arrivals"
              icon={<PlaneLanding className="size-3 text-primary" />}
              flights={arrivals}
              type="arrival"
              loading={loadingFlights}
              error={null}
            />

            {/* AI Assistant */}
            <div className="glass-panel rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="size-3.5 text-primary" />
                <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-white">Airport Assistant</h2>
              </div>

              {aiMessages.length > 0 && (
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {aiMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[90%] rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed ${
                        msg.role === "user"
                          ? "bg-primary/20 text-white border border-primary/20"
                          : "bg-white/[0.05] text-white/90 border border-white/10"
                      }`}>
                        {msg.role === "assistant" && (
                          <div className="flex items-center gap-1 mb-0.5 text-[9px] text-primary font-semibold uppercase tracking-widest">
                            <Bot className="size-2.5" /> AI
                          </div>
                        )}
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white/[0.05] border border-white/10 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                        <Loader2 className="size-2.5 animate-spin text-primary" />
                        <span className="text-[10px] text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {aiError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-2.5 py-1.5 flex gap-2">
                  <AlertCircle className="size-3 text-destructive shrink-0 mt-0.5" />
                  <span className="text-[10px] text-destructive">{aiError}</span>
                </div>
              )}

              <div className="flex gap-1.5">
                <input
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleAiSend())}
                  placeholder={`Ask about ${code}...`}
                  disabled={aiLoading}
                  className="flex-1 h-8 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[11px] text-white placeholder:text-muted-foreground focus:border-primary/40 focus:ring-1 focus:ring-primary/30 outline-none disabled:opacity-50"
                />
                <button
                  onClick={handleAiSend}
                  disabled={aiLoading || !aiInput.trim()}
                  className="h-8 px-2.5 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <Send className="size-3" />
                </button>
              </div>

              {aiMessages.length === 0 && !aiLoading && (
                <div className="flex flex-wrap gap-1">
                  {[
                    `Airlines at ${code}?`,
                    `Lounges at ${code}?`,
                    `Weather at ${code}?`,
                    `City transport from ${code}`,
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => setAiInput(prompt)}
                      className="text-[9px] px-2 py-1 rounded border border-white/10 bg-white/[0.03] text-muted-foreground hover:text-white hover:border-white/20 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactWeatherItem({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 space-y-0.5">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-sm font-mono font-semibold text-white leading-none">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

function CompactFlightPanel({ title, icon, flights, type, loading, error }: { title: string; icon: React.ReactNode; flights: AirportFlightsResponse | null; type: "departure" | "arrival"; loading: boolean; error: string | null }) {
  return (
    <div className="glass-panel rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-white flex items-center gap-1.5">
          {icon} {title}
          {flights && <span className="text-muted-foreground font-normal">({flights.count})</span>}
        </h3>
      </div>
      {loading && (
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-7 rounded bg-white/5 animate-pulse" />
          ))}
        </div>
      )}
      {error && !loading && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 flex items-start gap-2">
          <AlertCircle className="size-3 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground line-clamp-1">{error}</p>
        </div>
      )}
      {!loading && !error && flights && flights.flights.length === 0 && (
        <p className="text-[10px] text-muted-foreground py-4 text-center font-mono">No {type === "departure" ? "departures" : "arrivals"} found.</p>
      )}
      {!loading && !error && flights && flights.flights.length > 0 && (
        <CompactFlightTable flights={flights.flights} type={type} />
      )}
    </div>
  );
}

function CompactFlightTable({ flights, type }: { flights: FlightDto[]; type: "departure" | "arrival" }) {
  const formatTime = (v: string | null) => {
    if (!v) return "—";
    const d = new Date(v);
    if (!isNaN(d.getTime())) {
      return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}Z`;
    }
    return String(v).slice(11, 16) || "—";
  };

  return (
    <div className="space-y-0.5">
      {flights.slice(0, 8).map((f) => {
        const dest = type === "departure" ? f.arrivalIata ?? "—" : f.departureIata ?? "—";
        const time = type === "departure" ? f.departureScheduled : f.arrivalScheduled;
        const status = (f.status ?? "Scheduled").toLowerCase();
        return (
          <Link
            key={f.flightIata ?? f.flightNumber ?? `${f.airlineIata}-${Math.random()}`}
            to={`/tracking?flight_iata=${encodeURIComponent(f.flightIata ?? f.flightNumber ?? "")}`}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.04] transition-colors group"
          >
            <span className="font-mono text-[11px] font-semibold text-white w-16 truncate group-hover:text-primary transition-colors">
              {f.flightIata ?? f.flightNumber ?? "—"}
            </span>
            <span className="text-[10px] text-muted-foreground w-16 truncate">{f.airlineIata ?? "—"}</span>
            <span className="font-mono text-[10px] text-white/80 w-8">{dest}</span>
            <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-0.5 ml-auto">
              <Clock className="size-2.5 shrink-0 opacity-60" />
              {formatTime(time)}
            </span>
            <span className={`px-1 py-0.5 rounded text-[8px] font-mono uppercase tracking-widest border ${
              status === "active"
                ? "bg-primary/15 text-primary border-primary/20"
                : status === "landed"
                  ? "bg-white/5 text-white/70 border-white/10"
                  : "bg-white/5 text-muted-foreground border-white/10"
            }`}>
              {f.status ?? "Sched"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
