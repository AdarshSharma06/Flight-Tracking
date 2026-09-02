import { useEffect, useState } from "react";
import { flightService, type FlightSearchParams } from "@/services/flight.service";
import { bookingService } from "@/services/booking.service";
import { ApiError } from "@/services/api";
import type { FlightDto, BookingResponse, PageResponse } from "@/types/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Search, Ticket, Calendar, AlertCircle, Loader2, RefreshCw, Building2, Plane, CheckCircle2 } from "lucide-react";

export function BookingPage() {
  // search state
  const [flightIata, setFlightIata] = useState("");
  const [depIata, setDepIata] = useState("");
  const [arrIata, setArrIata] = useState("");
  const [airlineIata, setAirlineIata] = useState("");
  const [flightStatus, setFlightStatus] = useState("");
  const [limit, setLimit] = useState("10");

  const [results, setResults] = useState<FlightDto[] | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // booking dialog
  const [bookingFlight, setBookingFlight] = useState<FlightDto | null>(null);
  const [bookingForm, setBookingForm] = useState({ flightNumber: "", origin: "", destination: "", departureScheduled: "", arrivalScheduled: "", airlineName: "", aircraftRegistration: "" });
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<BookingResponse | null>(null);

  // history
  const [bookings, setBookings] = useState<BookingResponse[] | null>(null);
  const [pageInfo, setPageInfo] = useState<{ page: number; size: number; totalPages: number; totalElements: number } | null>(null);
  const [page, setPage] = useState(0);
  const [size] = useState(10);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingResponse | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const doSearch = async () => {
    const params: FlightSearchParams = {};
    if (flightIata.trim()) params.flight_iata = flightIata.trim();
    if (depIata.trim()) params.dep_iata = depIata.trim().toUpperCase();
    if (arrIata.trim()) params.arr_iata = arrIata.trim().toUpperCase();
    if (airlineIata.trim()) params.airline_iata = airlineIata.trim().toUpperCase();
    if (flightStatus && flightStatus !== "all") params.flight_status = flightStatus;
    const l = parseInt(limit, 10);
    if (!isNaN(l)) params.limit = l;

    if (!params.flight_iata && !params.dep_iata && !params.arr_iata && !params.airline_iata && !params.flight_status) {
      setSearchError("Enter at least one filter.");
      return;
    }
    setSearchError(null);
    setLoadingSearch(true);
    setResults(null);
    try {
      const res = await flightService.search(params);
      setResults(res.flights);
    } catch (e) {
      if (e instanceof ApiError) setSearchError(e.message);
      else setSearchError("Search failed.");
    } finally {
      setLoadingSearch(false);
    }
  };

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
    setBookingError(null);
    setBookingSuccess(null);
  };

  const validateBooking = (): string | null => {
    if (!bookingForm.flightNumber.trim()) return "flightNumber is required.";
    if (bookingForm.flightNumber.length > 20) return "flightNumber must be at most 20 characters.";
    if (!bookingForm.origin.trim()) return "origin is required.";
    if (!/^[A-Za-z]{3}$/.test(bookingForm.origin)) return "origin must be a 3-letter IATA code.";
    if (!bookingForm.destination.trim()) return "destination is required.";
    if (!/^[A-Za-z]{3}$/.test(bookingForm.destination)) return "destination must be a 3-letter IATA code.";
    if (bookingForm.airlineName && bookingForm.airlineName.length > 100) return "airlineName must be at most 100 characters.";
    if (bookingForm.aircraftRegistration && bookingForm.aircraftRegistration.length > 50) return "aircraftRegistration must be at most 50 characters.";
    return null;
  };

  const handleBooking = async () => {
    const v = validateBooking();
    if (v) {
      setBookingError(v);
      return;
    }
    setBookingLoading(true);
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
      loadHistory(0);
    } catch (e) {
      if (e instanceof ApiError) {
        const body = e.body as { message?: string; details?: string[] } | null;
        setBookingError(e.message + (body?.details ? ` — ${body.details.join(" ")}` : ""));
      } else setBookingError("Booking failed.");
    } finally {
      setBookingLoading(false);
    }
  };

  const loadHistory = async (p: number) => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const res: PageResponse<BookingResponse> = await bookingService.listMyBookingsPaginated(p, size);
      setBookings(res.content);
      setPageInfo({ page: res.page, size: res.size, totalPages: res.totalPages, totalElements: res.totalElements });
      setPage(res.page);
    } catch (e) {
      // fallback to non-paginated list
      try {
        const list = await bookingService.listMyBookings();
        setBookings(list);
        setPageInfo(null);
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
      if (e instanceof ApiError) alert(e.message);
    }
  };

  useEffect(() => {
    loadHistory(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Ticket className="size-6 text-primary" /> Booking</h1>
        <p className="text-sm text-muted-foreground">Search flights via <code className="bg-muted px-1 rounded">GET /api/flights/search</code> then create booking via <code className="bg-muted px-1 rounded">POST /api/bookings</code>. History via <code className="bg-muted px-1 rounded">GET /api/bookings?page&size</code>.</p>
      </div>

      {/* Search */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Search className="size-4" /> Find flights to book</CardTitle>
          <CardDescription>Same flight search contract as Tracking. No payment — just booking creation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            <div className="space-y-1.5"><Label>Flight IATA</Label><Input placeholder="LH400" value={flightIata} onChange={(e) => setFlightIata(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Departure IATA</Label><Input placeholder="DEL" maxLength={3} value={depIata} onChange={(e) => setDepIata(e.target.value.toUpperCase())} /></div>
            <div className="space-y-1.5"><Label>Arrival IATA</Label><Input placeholder="BOM" maxLength={3} value={arrIata} onChange={(e) => setArrIata(e.target.value.toUpperCase())} /></div>
            <div className="space-y-1.5"><Label>Airline</Label><Input placeholder="LH" value={airlineIata} onChange={(e) => setAirlineIata(e.target.value.toUpperCase())} /></div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={flightStatus} onValueChange={(v) => setFlightStatus(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="landed">Landed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2"><Label className="text-xs">Limit</Label>
              <Select value={limit} onValueChange={(v) => setLimit(v ?? "10")}><SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="10">10</SelectItem><SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem></SelectContent></Select>
            </div>
            <Button onClick={doSearch} disabled={loadingSearch} className="gap-2">{loadingSearch ? <RefreshCw className="size-4 animate-spin" /> : <Search className="size-4" />}Search</Button>
          </div>
          {searchError && <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Error</AlertTitle><AlertDescription className="text-xs">{searchError}</AlertDescription></Alert>}
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Flight results</CardTitle><CardDescription className="text-xs">{results ? `${results.length} flights` : "Search to see bookable flights."}</CardDescription></CardHeader>
        <CardContent>
          {loadingSearch && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>}
          {results && results.length === 0 && <Alert><AlertCircle className="size-4" /><AlertTitle>No flights found</AlertTitle><AlertDescription className="text-xs">No matching flights.</AlertDescription></Alert>}
          {results && results.length > 0 && (
            <div className="space-y-2">
              {results.map((f) => {
                const key = f.flightNumber ?? f.flightIata ?? Math.random().toString();
                return (
                  <div key={key} className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{f.flightIata ?? f.flightNumber ?? "—"}</span>
                        <Badge variant="outline" className="text-[10px]">{f.status ?? "—"}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="size-3" />{f.airlineName ?? f.airlineIata ?? "—"} • <Plane className="size-3" />{f.aircraftRegistration ?? "—"}</div>
                      <div className="text-xs">{f.departureIata ?? "—"} → {f.arrivalIata ?? "—"} <span className="text-muted-foreground">{f.departureScheduled ?? ""}</span></div>
                    </div>
                    <Button size="sm" onClick={() => openBooking(f)} className="gap-1.5 shrink-0"><Ticket className="size-4" /> Book</Button>
                  </div>
                );
              })}
            </div>
          )}
          {!results && !loadingSearch && !searchError && <p className="text-xs text-muted-foreground">Use search above.</p>}
        </CardContent>
      </Card>

      {/* Booking dialog */}
      <Dialog open={!!bookingFlight} onOpenChange={(open) => { if (!open) { setBookingFlight(null); setBookingSuccess(null); setBookingError(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Ticket className="size-5" /> Confirm booking</DialogTitle>
            <DialogDescription className="text-xs">Real <code className="bg-muted px-1 rounded">BookingRequest</code> — matches backend validation. No payment.</DialogDescription>
          </DialogHeader>
          {bookingFlight && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 border p-3 text-xs space-y-1">
                <div className="font-semibold">{bookingFlight.flightIata ?? bookingFlight.flightNumber} — {bookingFlight.airlineName ?? bookingFlight.airlineIata}</div>
                <div>{bookingFlight.departureIata} → {bookingFlight.arrivalIata} • {bookingFlight.departureScheduled ?? ""}</div>
              </div>

              {!bookingSuccess ? (
                <div className="space-y-3">
                  <div className="grid gap-3">
                    <div className="space-y-1.5"><Label>Flight number *</Label><Input value={bookingForm.flightNumber} onChange={(e) => setBookingForm((s) => ({ ...s, flightNumber: e.target.value }))} maxLength={20} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5"><Label>Origin IATA *</Label><Input value={bookingForm.origin} onChange={(e) => setBookingForm((s) => ({ ...s, origin: e.target.value.toUpperCase() }))} maxLength={3} /></div>
                      <div className="space-y-1.5"><Label>Destination IATA *</Label><Input value={bookingForm.destination} onChange={(e) => setBookingForm((s) => ({ ...s, destination: e.target.value.toUpperCase() }))} maxLength={3} /></div>
                    </div>
                    <div className="space-y-1.5"><Label>Departure scheduled</Label><Input placeholder="e.g., 2025-09-03T10:00:00Z" value={bookingForm.departureScheduled} onChange={(e) => setBookingForm((s) => ({ ...s, departureScheduled: e.target.value }))} maxLength={50} /></div>
                    <div className="space-y-1.5"><Label>Arrival scheduled</Label><Input placeholder="e.g., 2025-09-03T12:30:00Z" value={bookingForm.arrivalScheduled} onChange={(e) => setBookingForm((s) => ({ ...s, arrivalScheduled: e.target.value }))} maxLength={50} /></div>
                    <div className="space-y-1.5"><Label>Airline name</Label><Input value={bookingForm.airlineName} onChange={(e) => setBookingForm((s) => ({ ...s, airlineName: e.target.value }))} maxLength={100} /></div>
                    <div className="space-y-1.5"><Label>Aircraft registration</Label><Input value={bookingForm.aircraftRegistration} onChange={(e) => setBookingForm((s) => ({ ...s, aircraftRegistration: e.target.value }))} maxLength={50} /></div>
                  </div>
                  {bookingError && <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Booking failed</AlertTitle><AlertDescription className="text-xs">{bookingError}</AlertDescription></Alert>}
                  <Button onClick={handleBooking} disabled={bookingLoading} className="w-full gap-2">{bookingLoading ? <Loader2 className="size-4 animate-spin" /> : null}{bookingLoading ? "Booking…" : "Confirm booking"}</Button>
                </div>
              ) : (
                <Alert>
                  <CheckCircle2 className="size-4" />
                  <AlertTitle>Booking confirmed</AlertTitle>
                  <AlertDescription className="text-xs space-y-1">
                    <div>ID {bookingSuccess.id} • {bookingSuccess.flightNumber} • {bookingSuccess.origin} → {bookingSuccess.destination}</div>
                    <div>Status {bookingSuccess.status} • {new Date(bookingSuccess.createdAt).toLocaleString()}</div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div><CardTitle className="text-sm flex items-center gap-2"><Calendar className="size-4" /> My bookings</CardTitle><CardDescription className="text-xs">From <code className="bg-muted px-1 rounded">GET /api/bookings?page&size</code> — PageResponse.</CardDescription></div>
          <Button variant="outline" size="sm" onClick={() => loadHistory(page)} disabled={loadingHistory} className="gap-1.5"><RefreshCw className={`size-4 ${loadingHistory ? "animate-spin" : ""}`} /> Refresh</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingHistory && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}
          {historyError && <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>History error</AlertTitle><AlertDescription className="text-xs">{historyError}</AlertDescription></Alert>}
          {!loadingHistory && bookings && bookings.length === 0 && <Alert><AlertCircle className="size-4" /><AlertTitle>No bookings yet</AlertTitle><AlertDescription className="text-xs">Search and book a flight to see it here.</AlertDescription></Alert>}
          {bookings && bookings.length > 0 && (
            <>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Flight</TableHead>
                      <TableHead className="text-xs">Route</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Created</TableHead>
                      <TableHead className="text-xs"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookings.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-xs">{b.flightNumber}</TableCell>
                        <TableCell className="text-xs">{b.origin} → {b.destination}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{b.status}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell><Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => loadBookingDetail(b.id)}>View</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {pageInfo && pageInfo.totalPages > 1 && (
                <Pagination className="justify-center">
                  <PaginationContent>
                    <PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); if (page > 0) loadHistory(page - 1); }} className={page === 0 ? "pointer-events-none opacity-50" : ""} /></PaginationItem>
                    {Array.from({ length: pageInfo.totalPages }).slice(0, 5).map((_, i) => (
                      <PaginationItem key={i}><PaginationLink href="#" isActive={i === page} onClick={(e) => { e.preventDefault(); loadHistory(i); }}>{i + 1}</PaginationLink></PaginationItem>
                    ))}
                    <PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); if (page < pageInfo.totalPages - 1) loadHistory(page + 1); }} className={page >= pageInfo.totalPages - 1 ? "pointer-events-none opacity-50" : ""} /></PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
              {pageInfo && <p className="text-xs text-center text-muted-foreground">Page {pageInfo.page + 1} of {pageInfo.totalPages} • {pageInfo.totalElements} total</p>}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-sm">Booking #{selectedBooking?.id}</DialogTitle><DialogDescription className="text-xs">From <code className="bg-muted px-1 rounded">GET /api/bookings/{"{id}"}</code></DialogDescription></DialogHeader>
          {selectedBooking && (
            <div className="space-y-2 text-xs">
              <Separator />
              <div className="flex justify-between"><span className="text-muted-foreground">Flight</span><span className="font-mono font-medium">{selectedBooking.flightNumber}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">User</span><span>{selectedBooking.username} (#{selectedBooking.userId})</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Route</span><span>{selectedBooking.origin} → {selectedBooking.destination}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Departure</span><span>{selectedBooking.departureScheduled ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Arrival</span><span>{selectedBooking.arrivalScheduled ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Airline</span><span>{selectedBooking.airlineName ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Aircraft</span><span>{selectedBooking.aircraftRegistration ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="secondary" className="text-[10px]">{selectedBooking.status}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(selectedBooking.createdAt).toLocaleString()}</span></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Separator />
      <p className="text-xs text-muted-foreground text-center">No payments • No cross-user exposure • Backend enforces ownership (403 if not owned).</p>
    </div>
  );
}
