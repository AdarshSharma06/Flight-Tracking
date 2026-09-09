import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { bookingService } from "@/services/booking.service";
import { ignavService } from "@/services/ignav.service";
import { aiService, type RecommendationResponse } from "@/services/ai.service";
import { ApiError } from "@/services/api";
import type {
  BookingResponse,
  PageResponse,
  IgnavItineraryDto,
  IgnavProviderLink,
  IgnavSegmentDto,
} from "@/types/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import {
  Ticket,
  Plane,
  Loader2,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Bot,
  Info,
  Search,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";

function formatDuration(dur: string | null): string {
  if (!dur) return "";
  const m = dur.match(/(\d+)h\s*(\d+)?m?/);
  if (m) return `${m[1]}h${m[2] ? ` ${m[2]}m` : ""}`;
  return dur;
}

export function BookingPage() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<BookingResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Ignav search state
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [tripType, setTripType] = useState("ONE_WAY");
  const [adults, setAdults] = useState("1");
  const [cabin, setCabin] = useState("economy");
  const [maxStops, setMaxStops] = useState("any");
  const [market, setMarket] = useState("");

  const [searchResults, setSearchResults] = useState<IgnavItineraryDto[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // AI recommendation
  const [aiQuery, setAiQuery] = useState("");
  const [aiResult, setAiResult] = useState<RecommendationResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Booking-links state
  const [selectedItinerary, setSelectedItinerary] = useState<IgnavItineraryDto | null>(null);
  const [bookingOptions, setBookingOptions] = useState<{ legIndexes: number[]; links: IgnavProviderLink[] }[]>([]);
  const [bookingLinksLoading, setBookingLinksLoading] = useState(false);
  const [bookingLinksError, setBookingLinksError] = useState<string | null>(null);

  // Book click state
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingSavingError, setBookingSavingError] = useState<string | null>(null);

  // My bookings
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

  // Ignav search handler
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const o = origin.trim().toUpperCase();
    const d = destination.trim().toUpperCase();
    if (!o || o.length !== 3) { setSearchError("Enter a valid 3-letter origin IATA code."); return; }
    if (!d || d.length !== 3) { setSearchError("Enter a valid 3-letter destination IATA code."); return; }
    if (o === d) { setSearchError("Origin and destination must differ."); return; }
    if (!departureDate) { setSearchError("Select a departure date."); return; }
    if (tripType === "ROUND_TRIP" && !returnDate) { setSearchError("Select a return date for round-trip."); return; }

    setSearchError(null);
    setSearchLoading(true);
    setSearchResults(null);
    setSelectedItinerary(null);
    setBookingOptions([]);
    setBookingLinksError(null);
    try {
      const res = await ignavService.search({
        origin: o,
        destination: d,
        departureDate,
        returnDate: tripType === "ROUND_TRIP" ? returnDate : undefined,
        adults: parseInt(adults, 10) || 1,
        cabin: cabin || undefined,
        maxStops: maxStops === "any" ? undefined : parseInt(maxStops, 10),
        market: market.trim().toUpperCase() || undefined,
      });
      setSearchResults(res.itineraries ?? []);
      if (!res.itineraries || res.itineraries.length === 0) {
        setSearchError("No flights found for this route and date.");
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) setSearchError(err.message);
      else setSearchError("Search failed. Please try again.");
    } finally {
      setSearchLoading(false);
    }
  };

  // Select itinerary -> fetch booking links
  const handleSelectItinerary = async (itinerary: IgnavItineraryDto) => {
    setSelectedItinerary(itinerary);
    setBookingOptions([]);
    setBookingLinksError(null);
    setBookingSavingError(null);
    setBookingLinksLoading(true);
    try {
      const res = await ignavService.bookingLinks({ ignavId: itinerary.ignavId });
      setBookingOptions(res.bookingOptions ?? []);
    } catch (err: unknown) {
      if (err instanceof ApiError) setBookingLinksError(err.message);
      else setBookingLinksError("Failed to fetch booking options.");
    } finally {
      setBookingLinksLoading(false);
    }
  };

  // Book click -> save itinerary + redirect
  const handleBook = async (link: IgnavProviderLink, itinerary: IgnavItineraryDto) => {
    if (!link.url) { setBookingSavingError("No booking URL available for this option."); return; }
    setBookingSaving(true);
    setBookingSavingError(null);
    const redirectUrl = link.url;
    try {
      const legsJson = itinerary.segments && itinerary.segments.length > 0
        ? JSON.stringify(itinerary.segments.map(s => ({
            origin: s.origin,
            destination: s.destination,
            departureTime: s.departureTime,
            arrivalTime: s.arrivalTime,
            airline: s.operatingCarrierName ?? s.marketingCarrierCode,
            flightNumber: s.flightNumber,
            aircraft: s.aircraft,
            duration: s.duration,
          })))
        : null;
      await bookingService.create({
        flightNumber: itinerary.flightNumber ?? "—",
        origin: itinerary.origin ?? "—",
        destination: itinerary.destination ?? "—",
        departureScheduled: itinerary.departureTime ?? null,
        arrivalScheduled: itinerary.arrivalTime ?? null,
        airlineName: itinerary.airline ?? null,
        aircraftRegistration: itinerary.aircraft ?? null,
        ignavId: itinerary.ignavId,
        priceAmount: link.priceAmount ?? itinerary.priceAmount ?? null,
        priceCurrency: link.priceCurrency ?? itinerary.priceCurrency ?? null,
        priceStatus: link.priceStatus ?? itinerary.priceStatus ?? null,
        providerName: link.providerName ?? null,
        providerType: link.providerType ?? null,
        cabin: itinerary.cabin ?? null,
        duration: itinerary.duration ?? null,
        stops: itinerary.stops ?? null,
        ignavLegsJson: legsJson,
      });
      await loadBookings();
      await loadHistory(0);
      window.open(redirectUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      if (e instanceof ApiError) {
        const body = e.body as { message?: string; details?: string[] } | null;
        setBookingSavingError("Failed to save booking: " + e.message + (body?.details ? ` — ${body.details.join(" ")}` : ""));
      } else {
        setBookingSavingError("Failed to save booking. Please try again.");
      }
    } finally {
      setBookingSaving(false);
    }
  };

  // AI helpers
  const recommendationToDto = (flight: NonNullable<RecommendationResponse["recommended_flight"]>["flight"]): IgnavItineraryDto => ({
    ignavId: flight.flight_number ?? `ai-${Date.now()}`,
    airline: flight.airline ?? null,
    airlineCode: null,
    flightNumber: flight.flight_number ?? null,
    origin: flight.origin ?? null,
    destination: flight.destination ?? null,
    departureTime: flight.departure_time ?? null,
    arrivalTime: flight.arrival_time ?? null,
    duration: null,
    stops: 0,
    aircraft: flight.aircraft ?? null,
    cabin: null,
    priceAmount: null,
    priceCurrency: null,
    priceStatus: null,
    requiresSelfTransfer: null,
    bags: null,
    legs: [],
    segments: [],
  });

  const handleSelectRecommended = (
    scored: NonNullable<RecommendationResponse["recommended_flight"]> | RecommendationResponse["alternatives"][number],
  ) => {
    const dto = recommendationToDto(scored.flight);
    handleSelectItinerary(dto);
  };

  const doAiRecommend = async () => {
    const q = aiQuery.trim();
    if (!q) { setAiError("Please describe what kind of flight you are looking for."); return; }
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

  const loadHistory = async (p: number) => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const res: PageResponse<BookingResponse> = await bookingService.listMyBookingsPaginated(p, size);
      const cappedContent = res.content.slice(0, 10);
      const cappedTotal = Math.min(res.totalElements, 10);
      setMyBookings(cappedContent);
      setPageInfo({ page: 0, size: cappedContent.length || size, totalPages: cappedTotal > 0 ? 1 : 0, totalElements: cappedTotal });
      setPage(0);
    } catch (e) {
      try {
        const list = await bookingService.listMyBookings();
        const sorted = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);
        setMyBookings(sorted);
        setPageInfo(sorted.length ? { page: 0, size: sorted.length, totalPages: 1, totalElements: sorted.length } : null);
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
      if (e instanceof ApiError) console.error(e.message);
    }
  };

  const upcomingBookings = bookings.filter((b) => {
    if (!b.departureScheduled) return false;
    const dep = new Date(b.departureScheduled);
    if (isNaN(dep.getTime())) return false;
    return dep.getTime() > Date.now();
  });

  // All providers flattened from booking options
  const allProviders: (IgnavProviderLink & { _itinerary: IgnavItineraryDto })[] = [];
  if (selectedItinerary && bookingOptions.length > 0) {
    for (const opt of bookingOptions) {
      for (const link of opt.links) {
        allProviders.push({ ...link, _itinerary: selectedItinerary });
      }
    }
  }

  return (
    <div className="w-full min-h-[100dvh] pt-20 pb-24 bg-background">
      {/* Header */}
      <div className="w-full bg-background border-b border-white/5 py-10 px-6 relative overflow-hidden">
        <div className="absolute inset-0 z-0 bg-gradient-to-tr from-background via-background/90 to-primary/10 flex items-center justify-center opacity-30">
          <Plane className="size-96 text-primary absolute -right-20 -top-20 opacity-20" />
        </div>
        <div className="relative z-10 w-[88%] max-w-[1600px] mx-auto space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Flight Search</h1>
          <p className="text-sm text-muted-foreground">Search flights via Ignav and book through external providers.</p>
        </div>
      </div>

      <div className="w-[88%] max-w-[1600px] mx-auto px-6 pt-8 space-y-8">
        {/* Two-column: LEFT 60% search/results/active | RIGHT 40% AI */}
        <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-6 items-start">
          {/* LEFT 60% */}
          <div className="space-y-6 min-w-0">
            {/* Ignav Search Form */}
            <div className="glass-panel-heavy rounded-xl p-4 shadow-xl space-y-4">
              <div className="space-y-1">
                <h2 className="text-xs uppercase tracking-widest font-semibold text-white flex items-center gap-2">
                  <Search className="size-3.5 text-primary" /> Search flights to book
                </h2>
                <p className="text-[11px] text-muted-foreground">Powered by Ignav · Prices and availability from external providers.</p>
              </div>
              <form onSubmit={handleSearch} className="space-y-3">
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Origin IATA *</Label>
                    <Input placeholder="MAA" maxLength={3} value={origin} onChange={(e) => setOrigin(e.target.value.toUpperCase())} className="h-9 bg-white/5 border-white/10 font-mono text-sm uppercase" required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Destination IATA *</Label>
                    <Input placeholder="BLR" maxLength={3} value={destination} onChange={(e) => setDestination(e.target.value.toUpperCase())} className="h-9 bg-white/5 border-white/10 font-mono text-sm uppercase" required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Departure date *</Label>
                    <Input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} className="h-9 bg-white/5 border-white/10 font-mono text-sm" required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Trip type</Label>
                    <Select value={tripType} onValueChange={(v) => setTripType(v ?? "")}>
                      <SelectTrigger className="h-9 bg-white/5 border-white/10 font-mono text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ONE_WAY">One-way</SelectItem>
                        <SelectItem value="ROUND_TRIP">Round-trip</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {tripType === "ROUND_TRIP" && (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Return date *</Label>
                      <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="h-9 bg-white/5 border-white/10 font-mono text-sm" required />
                    </div>
                  </div>
                )}
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Adults</Label>
                    <Select value={adults} onValueChange={(v) => setAdults(v ?? "")}>
                      <SelectTrigger className="h-9 bg-white/5 border-white/10 font-mono text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1,2,3,4,5,6,7,8,9].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Cabin class</Label>
                    <Select value={cabin} onValueChange={(v) => setCabin(v ?? "")}>
                      <SelectTrigger className="h-9 bg-white/5 border-white/10 font-mono text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="economy">Economy</SelectItem>
                        <SelectItem value="premium_economy">Premium Economy</SelectItem>
                        <SelectItem value="business">Business</SelectItem>
                        <SelectItem value="first">First</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Max stops</Label>
                    <Select value={maxStops} onValueChange={(v) => setMaxStops(v ?? "")}>
                      <SelectTrigger className="h-9 bg-white/5 border-white/10 font-mono text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="0">Non-stop</SelectItem>
                        <SelectItem value="1">1 stop</SelectItem>
                        <SelectItem value="2">2 stops</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Market</Label>
                    <Input placeholder="IN" maxLength={2} value={market} onChange={(e) => setMarket(e.target.value.toUpperCase())} className="h-9 bg-white/5 border-white/10 font-mono text-sm uppercase" />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={searchLoading} className="gap-2 h-9 uppercase tracking-wider text-xs font-semibold">
                    {searchLoading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Search
                  </Button>
                </div>
              </form>
              {searchError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex gap-2">
                  <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{searchError}</p>
                </div>
              )}
              {bookingSavingError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex gap-2">
                  <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{bookingSavingError}</p>
                </div>
              )}
            </div>

            {/* Flight Results - 2 column grid */}
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-sm uppercase tracking-widest font-semibold flex items-center gap-2 text-white">
                  <Search className="size-4 text-primary" /> Flight results
                </h2>
                <p className="text-xs text-muted-foreground">
                  {searchResults ? `${searchResults.length} itineraries found` : "Search to see bookable flights."}
                </p>
              </div>

              {searchLoading && (
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-36 w-full rounded-lg bg-white/5 animate-pulse" />
                  ))}
                </div>
              )}

              {searchResults && searchResults.length === 0 && !searchLoading && (
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 flex gap-3">
                  <AlertCircle className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-white">No flights found</p>
                    <p className="text-xs text-muted-foreground">Try different dates or airports.</p>
                  </div>
                </div>
              )}

              {searchResults && searchResults.length > 0 && (
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                  {searchResults.map((it) => {
                    const isSelected = selectedItinerary?.ignavId === it.ignavId;
                    const segs = it.segments ?? [];
                    const firstSeg = segs[0];
                    const lastSeg = segs[segs.length - 1];
                    const dep = firstSeg?.departureTime;
                    const arr = lastSeg?.arrivalTime;
                    const airline = firstSeg?.operatingCarrierName ?? it.airline;
                    const carrierCode = firstSeg?.marketingCarrierCode ?? it.airlineCode;
                    const flightNum = firstSeg?.flightNumber ?? it.flightNumber;

                    return (
                      <div
                        key={it.ignavId}
                        className={`rounded-xl border p-4 flex flex-col gap-3 transition-colors ${
                          isSelected ? "border-primary/40 bg-primary/[0.06]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                        }`}
                      >
                        {/* Card header: airline + price */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {carrierCode && <span className="font-mono text-xs font-bold text-primary">{carrierCode}</span>}
                            {airline && <span className="text-[11px] text-muted-foreground truncate max-w-[140px]">{airline}</span>}
                          </div>
                          {it.priceAmount !== null && (
                            <div className="text-sm font-bold text-primary">
                              {it.priceCurrency ?? ""} {it.priceAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </div>
                          )}
                        </div>

                        {/* Route: ORIGIN -> DESTINATION with times */}
                        <div className="flex items-center gap-3">
                          <div className="space-y-0.5 min-w-0">
                            <p className="font-mono text-lg font-bold text-white leading-none">{it.origin ?? "—"}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {dep ? format(new Date(dep), "HH:mm") : ""}
                            </p>
                          </div>
                          <div className="flex-1 flex flex-col items-center gap-0.5 px-2">
                            <div className="text-[10px] text-muted-foreground">{formatDuration(it.duration)}</div>
                            <div className="w-full h-px bg-white/20 relative">
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                              {it.stops !== null && it.stops !== undefined && it.stops > 0 && Array.from({ length: it.stops }).map((_, i) => (
                                <div key={i} className="absolute top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-muted-foreground" style={{ left: `${((i + 1) / (it.stops! + 1)) * 100}%` }} />
                              ))}
                              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {it.stops === 0 ? "Non-stop" : it.stops !== null ? `${it.stops} stop${it.stops > 1 ? "s" : ""}` : ""}
                            </div>
                          </div>
                          <div className="space-y-0.5 min-w-0 text-right">
                            <p className="font-mono text-lg font-bold text-white leading-none">{it.destination ?? "—"}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {arr ? format(new Date(arr), "HH:mm") : ""}
                            </p>
                          </div>
                        </div>

                        {/* Flight number + cabin */}
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="font-mono">{flightNum ?? "—"}</span>
                          <span className="capitalize">{it.cabin ?? ""}</span>
                        </div>

                        {/* Select / Booking links inline */}
                        {!isSelected ? (
                          <Button
                            size="sm"
                            onClick={() => handleSelectItinerary(it)}
                            disabled={bookingLinksLoading}
                            className="gap-1.5 w-full uppercase tracking-wider text-xs font-semibold"
                          >
                            <Ticket className="size-4" /> View booking options
                          </Button>
                        ) : (
                          <div className="space-y-3 border-t border-white/10 pt-3">
                            {bookingLinksLoading && (
                              <div className="flex justify-center py-4">
                                <Loader2 className="size-5 animate-spin text-primary" />
                              </div>
                            )}
                            {bookingLinksError && (
                              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 flex gap-2">
                                <AlertCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
                                <p className="text-[11px] text-destructive">{bookingLinksError}</p>
                              </div>
                            )}
                            {!bookingLinksLoading && !bookingLinksError && bookingOptions.length === 0 && (
                              <p className="text-[11px] text-muted-foreground text-center py-2">No booking options available.</p>
                            )}
                            {!bookingLinksLoading && !bookingLinksError && allProviders.length > 0 && (
                              <div className="space-y-2">
                                {allProviders.map((link, idx) => (
                                  <div key={idx} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-white truncate">{link.providerName ?? "Provider"}</p>
                                      <div className="text-[11px] text-muted-foreground">
                                        {link.priceAmount !== null && (
                                          <span className="text-primary font-semibold">
                                            {link.priceCurrency ?? ""} {link.priceAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                          </span>
                                        )}
                                        {link.providerType && <span className="ml-1.5">· {link.providerType}</span>}
                                      </div>
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() => handleBook(link, it)}
                                      disabled={bookingSaving}
                                      className="gap-1 shrink-0 uppercase tracking-wider text-[10px] font-semibold h-7"
                                    >
                                      {bookingSaving ? <Loader2 className="size-3 animate-spin" /> : <ExternalLink className="size-3" />}
                                      Book
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!searchResults && !searchLoading && !searchError && (
                <p className="text-xs text-muted-foreground">Enter origin, destination, and date to search.</p>
              )}
            </div>

            {/* Active Itineraries */}
            <div className="space-y-4">
              <h2 className="text-sm uppercase tracking-widest font-semibold flex items-center gap-2 text-white">
                <Ticket className="size-4 text-primary" /> Active Itineraries
              </h2>

              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="size-8 animate-spin text-primary" />
                </div>
              ) : upcomingBookings.length === 0 ? (
                <div className="glass-panel rounded-xl p-12 text-center flex flex-col items-center justify-center space-y-4">
                  <Ticket className="size-12 text-white/10" />
                  <p className="font-mono text-sm text-muted-foreground">No upcoming flights</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {upcomingBookings.map((booking) => (
                    <div key={booking.id} className="glass-panel rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-primary/30 transition-colors">
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 rounded bg-primary/20 text-primary text-[10px] uppercase tracking-widest font-mono font-bold">
                            {booking.status}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">REF: {booking.id}</span>
                          {booking.providerName && <span className="text-xs text-muted-foreground">via {booking.providerName}</span>}
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
                          {booking.priceAmount !== null && (
                            <p className="text-xs text-primary font-semibold">
                              {booking.priceCurrency ?? ""} {booking.priceAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {booking.ignavId && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs uppercase tracking-wider font-semibold border-white/10 bg-white/[0.03]"
                              onClick={async () => {
                                try {
                                  const res = await ignavService.bookingLinks({ ignavId: booking.ignavId! });
                                  const firstUrl = res.bookingOptions?.flatMap(o => o.links).find(l => l.url)?.url;
                                  if (firstUrl) window.open(firstUrl, "_blank", "noopener,noreferrer");
                                  else alert("Booking links are currently unavailable for this flight.");
                                } catch {
                                  alert("Failed to fetch booking link. Please try again later.");
                                }
                              }}
                            >
                              <ExternalLink className="size-3 mr-1" /> Open booking
                            </Button>
                          )}
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
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* My bookings */}
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
                            <TableHead className="text-xs text-muted-foreground uppercase tracking-wider">Provider</TableHead>
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
                              <TableCell className="text-xs text-muted-foreground">{b.providerName ?? "—"}</TableCell>
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
                  {pageInfo && <p className="text-xs text-center text-muted-foreground">Page {pageInfo.page + 1} of {pageInfo.totalPages} · {pageInfo.totalElements} total</p>}
                </>
              )}
            </div>
          </div>

          {/* RIGHT 40% — AI Flight Recommendation */}
          <div className="glass-panel rounded-xl p-6 space-y-4 border border-white/10 min-w-0 lg:sticky lg:top-24">
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
              <Label htmlFor="ai-query" className="text-xs">
                What kind of flight are you looking for?
              </Label>
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
                    <div className="grid gap-2 sm:grid-cols-1 xl:grid-cols-2">
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
        </div>

        {/* Booking detail dialog */}
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
                {selectedBooking.providerName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Provider</span>
                    <span className="text-white">{selectedBooking.providerName}</span>
                  </div>
                )}
                {selectedBooking.priceAmount !== null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price</span>
                    <span className="text-primary font-semibold">{selectedBooking.priceCurrency ?? ""} {selectedBooking.priceAmount?.toLocaleString()}</span>
                  </div>
                )}
                {selectedBooking.cabin && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cabin</span>
                    <span className="text-white">{selectedBooking.cabin}</span>
                  </div>
                )}
                {selectedBooking.duration && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="text-white">{selectedBooking.duration}</span>
                  </div>
                )}
                {selectedBooking.stops !== null && selectedBooking.stops !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stops</span>
                    <span className="text-white">{selectedBooking.stops === 0 ? "Non-stop" : `${selectedBooking.stops} stop(s)`}</span>
                  </div>
                )}
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
                {selectedBooking.ignavId && (
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs border-white/10 bg-white/[0.03]"
                      onClick={async () => {
                        try {
                          const res = await ignavService.bookingLinks({ ignavId: selectedBooking.ignavId! });
                          const firstUrl = res.bookingOptions?.flatMap(o => o.links).find(l => l.url)?.url;
                          if (firstUrl) window.open(firstUrl, "_blank", "noopener,noreferrer");
                          else alert("Booking links are currently unavailable for this flight.");
                        } catch {
                          alert("Failed to fetch booking link. Please try again later.");
                        }
                      }}
                    >
                      <ExternalLink className="size-3 mr-1" /> Open booking page
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <p className="text-xs text-muted-foreground text-center">No payments · No cross-user exposure · Backend enforces ownership.</p>
      </div>
    </div>
  );
}
