import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { bookingService } from "@/services/booking.service";
import { flightService } from "@/services/flight.service";
import type { BookingResponse, FlightDto } from "@/types/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Ticket, Plane, Loader2, ArrowRight, MapPin, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export function BookingPage() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<BookingResponse[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search state
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  
  const [searchResults, setSearchResults] = useState<FlightDto[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  useEffect(() => {
    loadBookings();
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
    setSearchResults([]);
    
    try {
      const params: any = {};
      if (origin) params.departure_iata = origin;
      if (destination) params.arrival_iata = destination;
      if (date) params.date = date;
      
      const res = await flightService.search(params);
      setSearchResults(res.flights);
      if (res.flights.length === 0) {
        setSearchError("No flights found for this route/date.");
      }
    } catch (err: any) {
      setSearchError(err.message || "Failed to search flights");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleBooking = async (flight: FlightDto) => {
    setBookingError(null);
    setBookingLoading(true);
    try {
      await bookingService.create({
        flightNumber: flight.flightIata || flight.flightNumber || "UNKNOWN",
        origin: flight.departureIata || "UNK",
        destination: flight.arrivalIata || "UNK",
        departureScheduled: flight.departureScheduled,
        arrivalScheduled: flight.arrivalScheduled,
        airlineName: flight.airlineName,
        aircraftRegistration: flight.aircraftRegistration
      });
      // reload history
      await loadBookings();
      // clear search
      setSearchResults([]);
      setOrigin("");
      setDestination("");
      setDate("");
    } catch (err: any) {
      setBookingError(err.message || "Failed to book flight");
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div className="w-full min-h-[100dvh] pt-20 pb-24 bg-background">
      {/* Search Header */}
      <div className="w-full bg-background border-b border-white/5 py-12 px-6 relative overflow-hidden">
        
        {/* Subtle background element */}
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
                  <Input value={origin} onChange={e => setOrigin(e.target.value.toUpperCase())} placeholder="IATA (e.g. LHR)" maxLength={3} className="pl-9 h-12 bg-white/5 border-white/10 font-mono text-sm uppercase" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">Destination</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input value={destination} onChange={e => setDestination(e.target.value.toUpperCase())} placeholder="IATA (e.g. JFK)" maxLength={3} className="pl-9 h-12 bg-white/5 border-white/10 font-mono text-sm uppercase" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">Date</label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-12 bg-white/5 border-white/10 font-mono text-sm uppercase [color-scheme:dark]" />
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

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="pt-8 space-y-4">
              <h2 className="text-sm uppercase tracking-widest font-semibold flex items-center gap-2"><MapPin className="size-4 text-primary" /> Available Flights</h2>
              <div className="grid gap-4">
                {searchResults.map((flight, idx) => (
                  <div key={idx} className="glass-panel rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-6 hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-6">
                      <div className="space-y-1">
                        <p className="text-2xl font-mono text-white">{flight.departureIata ?? "—"}</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {flight.departureScheduled ? format(new Date(flight.departureScheduled), "MMM dd, HH:mm") : "—"}
                        </p>
                      </div>
                      <div className="flex flex-col items-center gap-1 opacity-50 px-2">
                        <ArrowRight className="size-4" />
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="text-2xl font-mono text-white">{flight.arrivalIata ?? "—"}</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {flight.arrivalScheduled ? format(new Date(flight.arrivalScheduled), "MMM dd, HH:mm") : "—"}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-2 w-full md:w-auto border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6">
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{flight.airlineName || "Airline"}</p>
                        <p className="text-sm font-mono text-white">{flight.flightIata || flight.flightNumber}</p>
                      </div>
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="text-xs uppercase tracking-wider font-semibold w-full md:w-auto"
                        onClick={() => handleBooking(flight)}
                        disabled={bookingLoading}
                      >
                        Book Flight
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Existing Bookings */}
      <div className="max-w-5xl mx-auto px-6 pt-16 space-y-6">
        <h2 className="text-sm uppercase tracking-widest font-semibold flex items-center gap-2"><Ticket className="size-4 text-primary" /> Active Itineraries</h2>
        
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-primary" /></div>
        ) : bookings.length === 0 ? (
          <div className="glass-panel rounded-xl p-12 text-center flex flex-col items-center justify-center space-y-4">
            <Ticket className="size-12 text-white/10" />
            <p className="font-mono text-sm text-muted-foreground">No active itineraries.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {bookings.map(booking => (
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
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{booking.departureScheduled ? format(new Date(booking.departureScheduled), "MMM dd, HH:mm") : "—"}</p>
                    </div>
                    <div className="flex flex-col items-center gap-1 opacity-50 px-4">
                      <ArrowRight className="size-4" />
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-3xl font-mono text-white">{booking.destination ?? "—"}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{booking.arrivalScheduled ? format(new Date(booking.arrivalScheduled), "MMM dd, HH:mm") : "—"}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-4 w-full md:w-auto border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Airline</p>
                    <p className="text-lg font-mono text-white">{booking.airlineName || "Unknown"}</p>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs uppercase tracking-wider font-semibold" onClick={() => navigate(`/tracking?flight_iata=${booking.flightNumber}`)}>
                    View Flight
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
