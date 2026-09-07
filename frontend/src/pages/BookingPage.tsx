import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { bookingService } from "@/services/booking.service";
import { flightService } from "@/services/flight.service";
import { aiService, type RecommendationResponse } from "@/services/ai.service";
import { ApiError } from "@/services/api";
import type { BookingResponse, FlightDto, PageResponse } from "@/types/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import {
  Ticket,
  Plane,
  Loader2,
  ArrowRight,
  MapPin,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Bot,
  Info,
  Search,
  Calendar,
  Building2,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";

export function BookingPage() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<BookingResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Search state — preserved current redesigned search
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");

  const [searchResults, setSearchResults] = useState<FlightDto[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // AI recommendation — restored from old frontend
  const [aiQuery, setAiQuery] = useState("");
  const [aiResult, setAiResult] = useState<RecommendationResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Booking dialog — restored
  const [bookingFlight, setBookingFlight] = useState<FlightDto | null>(null);
  const [bookingForm, setBookingForm] = useState({
    flightNumber: "",
    origin: "",
    destination: "",
    departureScheduled: "",
    arrivalScheduled: "",
    airlineName: "",
    aircraftRegistration: "",
  });
  const [bookingDialogLoading, setBookingDialogLoading] = useState(false);
  const [bookingDialogError, setBookingDialogError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<BookingResponse | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // My bookings paginated history — restored
  const [myBookings, setMyBookings] = useState<BookingResponse[] | null>(null);
  const [pageInfo, setPageInfo] = useState<{ page: number; size: number; totalPages: number; totalElements: number } | null>(null);
  const [page, setPage] = useState(0);
  const [size] = useState(10);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingResponse | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  useEffect(() => {
    loadBookings();
    loadHistory(0);
  }, []);

  const loadBookings = async () => {
    setLoading(true);
    try {
      const res = await bookingService.listMyBookings();
      setBookings(res || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);
    setSearchLoading(true);
    setSearchResults(null);

    try {
      const params: Record<string, string> = {};
      if (origin) params.departure_iata = origin;
      if (destination) params.arrival_iata = destination;
      if (date) params.date = date;

      // reuse existing flightService.search contract — origin/destination/date mapped as available
      // if params empty flightService will handle, but we allow empty to show error via catch
      const res = await flightService.search(params as unknown as Parameters<typeof flightService.search>[0]);
      setSearchResults(res.flights);
      if (res.flights.length === 0) {
        setSearchError("No flights found for this route/date.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to search flights";
      setSearchError(msg);
    } finally {
      setSearchLoading(false);
    }
  };

  // --- AI helpers (from old frontend) ---
  const recommendationToDto = (flight: NonNullable<RecommendationResponse["recommended_flight"]>["flight"]): FlightDto => ({
    flightNumber: flight.flight_number ?? null,
    flightIata: flight.flight_number ?? null,
    flightIcao: null,
    airlineName: flight.airline ?? null,
    airlineIata: flight.airline ?? null,
    airlineIcao: null,
    departureAirport: null,
    departureIata: flight.origin ?? null,
    departureIcao: null,
    departureTerminal: null,
    departureGate: null,
    departureScheduled: flight.departure_time ?? null,
    departureEstimated: null,
    departureActual: null,
    departureDelay: null,
    arrivalAirport: null,
    arrivalIata: flight.destination ?? null,
    arrivalIcao: null,
    arrivalTerminal: null,
    arrivalGate: null,
    arrivalScheduled: flight.arrival_time ?? null,
    arrivalEstimated: null,
    arrivalActual: null,
    arrivalDelay: null,
    status: flight.status ?? null,
    aircraftRegistration: flight.aircraft ?? null,
    aircraftIata: null,
    aircraftIcao: null,
  });

  const openBooking = (f: FlightDto) => {
    setBookingFlight(f);
    setBookingForm({
      flightNumber: f.flightIata ?? f.flightNumber ?? "",
      origin: f.departureIata ?? "",
      destination: f.arrivalIata ?? "",
      departureScheduled: f.departureScheduled ?? "",
      arrivalScheduled: f.arrivalScheduled ?? "",
      airlineName: f.airlineName ?? "",
      aircraftRegistration: f.aircraftRegistration ?? "",
    });
    setBookingDialogError(null);
    setBookingSuccess(null);
  };

  const handleSelectRecommended = (
    scored: NonNullable<RecommendationResponse["recommended_flight"]> | RecommendationResponse["alternatives"][number],
  ) => {
    const dto = recommendationToDto(scored.flight);
    openBooking(dto);
  };

  const doAiRecommend = async () => {
    const q = aiQuery.trim();
    if (!q) {
      setAiError("Please describe what kind of flight you are looking for.");
      return;
    }
    setAiError(null);
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await aiService.recommend(q);
      setAiResult(res);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) setAiError("Your session has expired. Please log in again.");
        else if (e.status === 400 && e.message.toLowerCase().includes("origin") && e.message.toLowerCase().includes("destination")) {
          setAiError("Please provide both an origin and destination.");
        } else {
          setAiError(e.message || "Sorry, I couldn't generate flight recommendations right now. Please try again.");
        }
      } else {
        setAiError("Sorry, I couldn't generate flight recommendations right now. Please try again.");
      }
    } finally {
      setAiLoading(false);
    }
  };

  const fillAiQueryFromSearch = () => {
    const parts: string[] = [];
    if (origin.trim() && destination.trim()) {
      parts.push(`from ${origin.trim().toUpperCase()} to ${destination.trim().toUpperCase()}`);
    } else if (origin.trim()) {
      parts.push(`from ${origin.trim().toUpperCase()}`);
    } else if (destination.trim()) {
      parts.push(`to ${destination.trim().toUpperCase()}`);
    }
    const base = parts.length ? `Find me a flight ${parts.join(" ")}` : "";
    const hint = aiQuery.trim() ? aiQuery : base || "I need a direct evening flight from Delhi to Mumbai";
    setAiQuery(hint);
  };

  const validateBooking = (): string | null => {
    if (!bookingForm.flightNumber.trim()) return "flightNumber is required.";
    if (bookingForm.flightNumber.length > 20) return "flightNumber must be at most 20 characters.";
    if (!bookingForm.origin.trim()) return "origin is required.";
    if (!/^[A-Za-z]{3}$/.test(bookingForm.origin)) return "origin must be a 3-letter IATA code.";
    if (!bookingForm.destination.trim()) return "destination is required.";
    if (!/^[A-Za-z]{3}$/.test(bookingForm.destination)) return "destination must be a 3-letter IATA code.";
    if (bookingForm.airlineName && bookingForm.airlineName.length > 100) return "airlineName must be at most 100 characters.";
    if (bookingForm.aircraftRegistration && bookingForm.aircraftRegistration.length > 50)
      return "aircraftRegistration must be at most 50 characters.";
    return null;
  };

  const handleBookingConfirm = async () => {
    const v = validateBooking();
    if (v) {
      setBookingDialogError(v);
      return;
    }
    setBookingDialogLoading(true);
    setBookingDialogError(null);
    setBookingError(null);
    try {
      const res = await bookingService.create({
        flightNumber: bookingForm.flightNumber.trim(),
        origin: bookingForm.origin.trim().toUpperCase(),
        destination: bookingForm.destination.trim().toUpperCase(),
        departureScheduled: bookingForm.departureScheduled || null,
        arrivalScheduled: bookingForm.arrivalScheduled || null,
        airlineName: bookingForm.airlineName || null,
        aircraftRegistration: bookingForm.aircraftRegistration || null,
      });
      setBookingSuccess(res);
      await loadBookings();
      await loadHistory(0);
    } catch (e) {
      if (e instanceof ApiError) {
        const body = e.body as { message?: string; details?: string[] } | null;
        setBookingDialogError(e.message + (body?.details ? ` — ${body.details.join(" ")}` : ""));
        setBookingError(e.message);
      } else setBookingDialogError("Booking failed.");
    } finally {
      setBookingDialogLoading(false);
    }
  };

  const loadHistory = async (p: number) => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const res: PageResponse<BookingResponse> = await bookingService.listMyBookingsPaginated(p, size);
      setMyBookings(res.content);
      setPageInfo({ page: res.page, size: res.size, totalPages: res.totalPages, totalElements: res.totalElements });
      setPage(res.page);
    } catch (e) {
      try {
        const list = await bookingService.listMyBookings();
        setMyBookings(list);
        setPageInfo(list.length ? { page: 0, size: list.length, totalPages: 1, totalElements: list.length } : null);
      } catch (err2) {
        if (e instanceof ApiError) setHistoryError(e.message);
        else if (err2 instanceof ApiError) setHistoryError(err2.message);
        else setHistoryError("Failed to load bookings.");
      }
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadBookingDetail = async (id: number) => {
    try {
      const res = await bookingService.getById(id);
      setSelectedBooking(res);
      setDetailDialogOpen(true);
    } catch (e) {
      if (e instanceof ApiError) setBookingError(e.message);
    }
  };

  return (
    <div className="w-full min-h-[100dvh] pt-20 pb-24 bg-background">
      {/* Search Header — PRESERVED */}
      <div className="w-full bg-background border-b border-white/5 py-12 px-6 relative overflow-hidden">
        <div className="absolute inset-0 z-0 bg-gradient-to-tr from-background via-background/90 to-primary/10 flex items-center justify-center opacity-30">
          <Plane className="size-96 text-primary absolute -right-20 -top-20 opacity-20" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">Flight Search</h1>
            <p className="text-sm text-muted-foreground">Find and book your next operational route.</p>
          </div>

          <div className="glass-panel-heavy p-4 rounded-xl shadow-2xl">
            <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">Origin</label>
                <div className="relative">
                  <Plane className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value.toUpperCase())}
                    placeholder="IATA (e.g. LHR)"
                    maxLength={3}
                    className="pl-9 h-12 bg-white/5 border-white/10 font-mono text-sm uppercase"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">Destination</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value.toUpperCase())}
                    placeholder="IATA (e.g. JFK)"
                    maxLength={3}
                    className="pl-9 h-12 bg-white/5 border-white/10 font-mono text-sm uppercase"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">Date</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-12 bg-white/5 border-white/10 font-mono text-sm uppercase [color-scheme:dark]"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={searchLoading} className="h-12 px-8 uppercase tracking-wider font-semibold text-xs w-full">
                  {searchLoading ? <Loader2 className="size-4 animate-spin" /> : "Search"}
                </Button>
              </div>
            </form>
          </div>

          {searchError && (
            <div className="max-w-xl mx-auto rounded p-3 border border-destructive/30 bg-destructive/10 flex items-center gap-3">
              <AlertCircle className="size-4 text-destructive shrink-0" />
              <span className="text-xs text-destructive">{searchError}</span>
            </div>
          )}
          {bookingError && (
            <div className="max-w-xl mx-auto rounded p-3 border border-destructive/30 bg-destructive/10 flex items-center gap-3">
              <AlertCircle className="size-4 text-destructive shrink-0" />
              <span className="text-xs text-destructive">{bookingError}</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pt-10 space-y-8">
        {/* AI Flight Recommendation — RESTORED */}
        <div className="glass-panel rounded-xl p-6 space-y-4 border border-white/10">
          <div className="space-y-1.5">
            <h2 className="text-sm uppercase tracking-widest font-semibold flex items-center gap-2 text-white">
              <Sparkles className="size-4 text-primary" /> AI Flight Recommendation
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tell us what you are looking for and get flight recommendations based on your preferences, flight data, and available weather
              information.
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Bot className="size-3 text-primary" /> Your saved flight preferences are considered automatically.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-query" className="text-xs">What kind of flight are you looking for?</Label>
            <textarea
              id="ai-query"
              placeholder="e.g. I need a direct evening flight from Delhi to Mumbai"
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              rows={3}
              className="flex min-h-[72px] w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:ring-1 focus-visible:ring-primary/30 outline-none disabled:opacity-50 resize-none text-white"
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={doAiRecommend} disabled={aiLoading} className="gap-2 uppercase tracking-wider text-xs font-semibold">
                {aiLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {aiLoading ? "Getting recommendations…" : "Get AI Recommendations"}
              </Button>
              <Button variant="outline" size="sm" onClick={fillAiQueryFromSearch} disabled={aiLoading} className="text-xs border-white/10 bg-white/[0.03] hover:bg-white/10">
                Use current search
              </Button>
            </div>
          </div>

          {aiError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2">
              <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-destructive">Recommendation failed</p>
                <p className="text-xs text-destructive/80">{aiError}</p>
              </div>
            </div>
          )}

          {aiLoading && (
            <div className="space-y-3">
              <div className="h-28 w-full rounded-lg bg-white/5 animate-pulse" />
              <div className="h-20 w-full rounded-lg bg-white/5 animate-pulse" />
            </div>
          )}

          {aiResult && !aiLoading && (
            <div className="space-y-4">
              {aiResult.recommended_flight ? (
                <div className="rounded-xl border border-primary/30 bg-primary/[0.07] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary text-primary-foreground text-[10px] uppercase tracking-widest">Recommended</Badge>
                    <span className="text-xs text-muted-foreground">{aiResult.total_flights_evaluated} flights evaluated</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-white">{aiResult.recommended_flight.flight.flight_number ?? "—"}</span>
                        {aiResult.recommended_flight.flight.airline && (
                          <span className="text-xs text-muted-foreground">{aiResult.recommended_flight.flight.airline}</span>
                        )}
                        {aiResult.recommended_flight.flight.status && (
                          <Badge variant="outline" className="text-[10px] border-white/15 text-white">
                            {aiResult.recommended_flight.flight.status}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm font-medium text-white">
                        {aiResult.recommended_flight.flight.origin ?? "—"} → {aiResult.recommended_flight.flight.destination ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {aiResult.recommended_flight.flight.departure_time && (
                          <div>Scheduled departure: {aiResult.recommended_flight.flight.departure_time}</div>
                        )}
                        {aiResult.recommended_flight.flight.arrival_time && (
                          <div>Scheduled arrival: {aiResult.recommended_flight.flight.arrival_time}</div>
                        )}
                        {aiResult.recommended_flight.flight.aircraft && (
                          <div className="flex items-center gap-1">
                            <Plane className="size-3" /> {aiResult.recommended_flight.flight.aircraft}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleSelectRecommended(aiResult.recommended_flight!)} className="gap-1.5 shrink-0 uppercase tracking-wider text-xs">
                      <Ticket className="size-4" /> Select flight
                    </Button>
                  </div>

                  {aiResult.explanation && (
                    <div className="space-y-1.5 pt-3 border-t border-white/10">
                      <h4 className="text-xs font-semibold flex items-center gap-1 text-white">
                        <Info className="size-3 text-primary" /> Why this flight
                      </h4>
                      <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">{aiResult.explanation}</p>
                    </div>
                  )}

                  {aiResult.limitations && aiResult.limitations.length > 0 && (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex gap-2">
                      <Info className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-white">Limitations</p>
                        <ul className="list-disc ml-4 space-y-0.5 text-xs text-muted-foreground">
                          {aiResult.limitations.map((lim, idx) => (
                            <li key={idx}>{lim}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 flex gap-3">
                  <AlertCircle className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-white">No recommendation available</p>
                    <p className="text-xs text-muted-foreground">{aiResult.explanation || "No flights matched your criteria."}</p>
                    {aiResult.limitations && aiResult.limitations.length > 0 && (
                      <ul className="list-disc ml-4 space-y-0.5 text-xs text-muted-foreground mt-1">
                        {aiResult.limitations.map((lim, idx) => (
                          <li key={idx}>{lim}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {aiResult.alternatives && aiResult.alternatives.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Other suitable options</h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {aiResult.alternatives.map((alt, idx) => (
                      <div key={idx} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-semibold text-white">{alt.flight.flight_number ?? "—"}</span>
                          <Badge variant="outline" className="text-[10px] border-white/15 text-white">
                            {alt.flight.status ?? "—"}
                          </Badge>
                        </div>
                        <div className="text-xs text-white">
                          {alt.flight.origin ?? "—"} → {alt.flight.destination ?? "—"}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {alt.flight.departure_time ?? ""} {alt.flight.departure_time && alt.flight.arrival_time ? "→" : ""} {alt.flight.arrival_time ?? ""}
                        </div>
                        <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1 border-white/10 bg-white/[0.03]" onClick={() => handleSelectRecommended(alt)}>
                          <Ticket className="size-3" /> Select
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Flight Results — RESTORED */}
        <div className="glass-panel rounded-xl p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm uppercase tracking-widest font-semibold flex items-center gap-2 text-white">
              <Search className="size-4 text-primary" /> Flight results
            </h2>
            <p className="text-xs text-muted-foreground">{searchResults ? `${searchResults.length} flights` : "Search to see bookable flights."}</p>
          </div>

          {searchLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 w-full rounded-lg bg-white/5 animate-pulse" />
              ))}
            </div>
          )}

          {searchResults && searchResults.length === 0 && !searchLoading && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 flex gap-3">
              <AlertCircle className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-white">No flights found</p>
                <p className="text-xs text-muted-foreground">No matching flights.</p>
              </div>
            </div>
          )}

          {searchResults && searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((f) => {
                const key = f.flightNumber ?? f.flightIata ?? Math.random().toString();
                return (
                  <div key={key} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.06] transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-white">{f.flightIata ?? f.flightNumber ?? "—"}</span>
                        <Badge variant="outline" className="text-[10px] border-white/15 text-white">
                          {f.status ?? "—"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Building2 className="size-3" />
                        {f.airlineName ?? f.airlineIata ?? "—"} • <Plane className="size-3" />
                        {f.aircraftRegistration ?? "—"}
                      </div>
                      <div className="text-xs text-white">
                        {f.departureIata ?? "—"} → {f.arrivalIata ?? "—"}{" "}
                        <span className="text-muted-foreground">{f.departureScheduled ? format(new Date(f.departureScheduled), "MMM dd, HH:mm") : ""}</span>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => openBooking(f)} className="gap-1.5 shrink-0 uppercase tracking-wider text-xs">
                      <Ticket className="size-4" /> Book
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {!searchResults && !searchLoading && !searchError && (
            <p className="text-xs text-muted-foreground">Use search above.</p>
          )}
        </div>

        {/* Booking dialog — RESTORED */}
        <Dialog open={!!bookingFlight} onOpenChange={(open) => {
          if (!open) {
            setBookingFlight(null);
            setBookingSuccess(null);
            setBookingDialogError(null);
          }
        }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-card border-white/10">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Ticket className="size-5 text-primary" /> Confirm booking
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Booking will be created via <code className="bg-white/10 px-1 rounded">POST /api/bookings</code>. No payment required.
              </DialogDescription>
            </DialogHeader>
            {bookingFlight && (
              <div className="space-y-4">
                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 text-xs space-y-1">
                  <div className="font-semibold text-white">
                    {bookingFlight.flightIata ?? bookingFlight.flightNumber} — {bookingFlight.airlineName ?? bookingFlight.airlineIata}
                  </div>
                  <div className="text-muted-foreground">
                    {bookingFlight.departureIata} → {bookingFlight.arrivalIata} • {bookingFlight.departureScheduled ?? ""}
                  </div>
                </div>

                {!bookingSuccess ? (
                  <div className="space-y-3">
                    <div className="grid gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Flight number *</Label>
                        <Input value={bookingForm.flightNumber} onChange={(e) => setBookingForm((s) => ({ ...s, flightNumber: e.target.value }))} maxLength={20} className="bg-white/5 border-white/10" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Origin IATA *</Label>
                          <Input value={bookingForm.origin} onChange={(e) => setBookingForm((s) => ({ ...s, origin: e.target.value.toUpperCase() }))} maxLength={3} className="bg-white/5 border-white/10 font-mono uppercase" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Destination IATA *</Label>
                          <Input value={bookingForm.destination} onChange={(e) => setBookingForm((s) => ({ ...s, destination: e.target.value.toUpperCase() }))} maxLength={3} className="bg-white/5 border-white/10 font-mono uppercase" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Departure scheduled</Label>
                        <Input placeholder="e.g., 2025-09-03T10:00:00Z" value={bookingForm.departureScheduled} onChange={(e) => setBookingForm((s) => ({ ...s, departureScheduled: e.target.value }))} maxLength={50} className="bg-white/5 border-white/10 font-mono text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Arrival scheduled</Label>
                        <Input placeholder="e.g., 2025-09-03T12:30:00Z" value={bookingForm.arrivalScheduled} onChange={(e) => setBookingForm((s) => ({ ...s, arrivalScheduled: e.target.value }))} maxLength={50} className="bg-white/5 border-white/10 font-mono text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Airline name</Label>
                        <Input value={bookingForm.airlineName} onChange={(e) => setBookingForm((s) => ({ ...s, airlineName: e.target.value }))} maxLength={100} className="bg-white/5 border-white/10" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Aircraft registration</Label>
                        <Input value={bookingForm.aircraftRegistration} onChange={(e) => setBookingForm((s) => ({ ...s, aircraftRegistration: e.target.value }))} maxLength={50} className="bg-white/5 border-white/10" />
                      </div>
                    </div>
                    {bookingDialogError && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex gap-2">
                        <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                        <p className="text-xs text-destructive">{bookingDialogError}</p>
                      </div>
                    )}
                    <Button onClick={handleBookingConfirm} disabled={bookingDialogLoading} className="w-full gap-2 uppercase tracking-wider text-xs">
                      {bookingDialogLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                      {bookingDialogLoading ? "Booking…" : "Confirm booking"}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 flex gap-3">
                    <CheckCircle2 className="size-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-emerald-400">Booking confirmed</p>
                      <p className="text-xs text-muted-foreground">ID {bookingSuccess.id} • {bookingSuccess.flightNumber} • {bookingSuccess.origin} → {bookingSuccess.destination}</p>
                      <p className="text-xs text-muted-foreground">Status {bookingSuccess.status} • {new Date(bookingSuccess.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Active Itineraries — PRESERVED */}
        <div className="space-y-4">
          <h2 className="text-sm uppercase tracking-widest font-semibold flex items-center gap-2 text-white">
            <Ticket className="size-4 text-primary" /> Active Itineraries
          </h2>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : bookings.length === 0 ? (
            <div className="glass-panel rounded-xl p-12 text-center flex flex-col items-center justify-center space-y-4">
              <Ticket className="size-12 text-white/10" />
              <p className="font-mono text-sm text-muted-foreground">No active itineraries.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {bookings.map((booking) => (
                <div key={booking.id} className="glass-panel rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-primary/30 transition-colors">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-0.5 rounded bg-primary/20 text-primary text-[10px] uppercase tracking-widest font-mono font-bold">
                        {booking.status}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">REF: {booking.id}</span>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="space-y-1">
                        <p className="text-3xl font-mono text-white">{booking.origin ?? "—"}</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {booking.departureScheduled ? format(new Date(booking.departureScheduled), "MMM dd, HH:mm") : "—"}
                        </p>
                      </div>
                      <div className="flex flex-col items-center gap-1 opacity-50 px-4">
                        <ArrowRight className="size-4" />
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="text-3xl font-mono text-white">{booking.destination ?? "—"}</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {booking.arrivalScheduled ? format(new Date(booking.arrivalScheduled), "MMM dd, HH:mm") : "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-4 w-full md:w-auto border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6">
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Airline</p>
                      <p className="text-lg font-mono text-white">{booking.airlineName || "Unknown"}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs uppercase tracking-wider font-semibold border-white/10 bg-white/[0.03]"
                      onClick={() => navigate(`/tracking?flight_iata=${booking.flightNumber}`)}
                    >
                      View Flight
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My bookings — RESTORED */}
        <div className="glass-panel rounded-xl p-6 space-y-4">
          <div className="flex flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-sm uppercase tracking-widest font-semibold flex items-center gap-2 text-white">
                <Calendar className="size-4 text-primary" /> My bookings
              </h2>
              <p className="text-xs text-muted-foreground">Your booking history. Refresh to sync with server.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => loadHistory(page)} disabled={loadingHistory} className="gap-1.5 border-white/10 bg-white/[0.03] text-xs">
              <RefreshCw className={`size-4 ${loadingHistory ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>

          {loadingHistory && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 w-full rounded-lg bg-white/5 animate-pulse" />
              ))}
            </div>
          )}

          {historyError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex gap-2">
              <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{historyError}</p>
            </div>
          )}

          {!loadingHistory && myBookings && myBookings.length === 0 && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-6 flex flex-col items-center gap-2 text-center">
              <Ticket className="size-8 text-white/10" />
              <p className="text-xs font-semibold text-white">No bookings yet</p>
              <p className="text-xs text-muted-foreground">Search and book a flight to see it here.</p>
            </div>
          )}

          {myBookings && myBookings.length > 0 && (
            <>
              <div className="rounded-xl border border-white/10 overflow-hidden bg-white/[0.02]">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-xs text-muted-foreground uppercase tracking-wider">Flight</TableHead>
                        <TableHead className="text-xs text-muted-foreground uppercase tracking-wider">Route</TableHead>
                        <TableHead className="text-xs text-muted-foreground uppercase tracking-wider">Status</TableHead>
                        <TableHead className="text-xs text-muted-foreground uppercase tracking-wider">Created</TableHead>
                        <TableHead className="text-xs"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myBookings.map((b) => (
                        <TableRow key={b.id} className="border-white/5 hover:bg-white/[0.04]">
                          <TableCell className="font-mono text-xs text-white">{b.flightNumber}</TableCell>
                          <TableCell className="text-xs text-white">
                            {b.origin} → {b.destination}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px] bg-white/10 text-white border-white/10">
                              {b.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-7 text-xs hover:bg-white/10" onClick={() => loadBookingDetail(b.id)}>
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {pageInfo && pageInfo.totalPages > 1 && (
                <Pagination className="justify-center">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); if (page > 0) loadHistory(page - 1); }} className={page === 0 ? "pointer-events-none opacity-50" : "hover:bg-white/10"} />
                    </PaginationItem>
                    {Array.from({ length: Math.min(pageInfo.totalPages, 5) }).map((_, i) => (
                      <PaginationItem key={i}>
                        <PaginationLink href="#" isActive={i === page} onClick={(e) => { e.preventDefault(); loadHistory(i); }} className="hover:bg-white/10 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground">
                          {i + 1}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext href="#" onClick={(e) => { e.preventDefault(); if (page < pageInfo.totalPages - 1) loadHistory(page + 1); }} className={page >= pageInfo.totalPages - 1 ? "pointer-events-none opacity-50" : "hover:bg-white/10"} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
              {pageInfo && <p className="text-xs text-center text-muted-foreground">Page {pageInfo.page + 1} of {pageInfo.totalPages} • {pageInfo.totalElements} total</p>}
            </>
          )}
        </div>

        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="bg-card border-white/10">
            <DialogHeader>
              <DialogTitle className="text-sm text-white">Booking #{selectedBooking?.id}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">Booking details</DialogDescription>
            </DialogHeader>
            {selectedBooking && (
              <div className="space-y-2 text-xs">
                <Separator className="bg-white/10" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Flight</span>
                  <span className="font-mono font-medium text-white">{selectedBooking.flightNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">User</span>
                  <span className="text-white">{selectedBooking.username} (#{selectedBooking.userId})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Route</span>
                  <span className="text-white">{selectedBooking.origin} → {selectedBooking.destination}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Departure</span>
                  <span className="text-white">{selectedBooking.departureScheduled ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Arrival</span>
                  <span className="text-white">{selectedBooking.arrivalScheduled ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Airline</span>
                  <span className="text-white">{selectedBooking.airlineName ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Aircraft</span>
                  <span className="text-white">{selectedBooking.aircraftRegistration ?? "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="secondary" className="text-[10px] bg-white/10 text-white border-white/10">
                    {selectedBooking.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="text-white">{new Date(selectedBooking.createdAt).toLocaleString()}</span>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <p className="text-xs text-muted-foreground text-center">No payments • No cross-user exposure • Backend enforces ownership.</p>
      </div>
    </div>
  );
}
