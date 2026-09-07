import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { airportService } from "@/services/airport.service";
import { flightService } from "@/services/flight.service";
import type { AirportDto, FlightDto } from "@/types/api";
import { TrackingMap } from "@/components/tracking/TrackingMap";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, PlaneTakeoff, PlaneLanding, Globe } from "lucide-react";

export function AirportDetailPage() {
  const { iata } = useParams<{ iata: string }>();
  const [airport, setAirport] = useState<AirportDto | null>(null);
  const [departures, setDepartures] = useState<FlightDto[]>([]);
  const [arrivals, setArrivals] = useState<FlightDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!iata) return;
    loadData(iata);
  }, [iata]);

  const loadData = async (code: string) => {
    setLoading(true);
    try {
      const apt = await airportService.getByIata(code);
      setAirport(apt);
      
      const [dep, arr] = await Promise.all([
        flightService.search({ dep_iata: code, limit: 15 }),
        flightService.search({ arr_iata: code, limit: 15 })
      ]);
      setDepartures(dep.flights);
      setArrivals(arr.flights);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><Loader2 className="size-8 animate-spin text-primary" /></div>;
  }

  if (!airport) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background space-y-4">
        <h1 className="text-2xl font-mono text-white">404 - Airport Not Found</h1>
        <Link to="/airports" className="text-primary uppercase text-xs tracking-wider font-semibold">Return to Directory</Link>
      </div>
    );
  }

  const mapPoint = airport.latitude && airport.longitude 
    ? { lat: airport.latitude, lng: airport.longitude, label: airport.iata, subLabel: airport.name } 
    : null;

  return (
    <div className="w-full flex-1 flex flex-col lg:flex-row h-[100dvh] pt-20 overflow-hidden bg-background">
      {/* Left Details 60% */}
      <div className="w-full lg:w-[60%] flex flex-col h-full border-r border-white/5 relative z-10 shadow-2xl">
        <div className="p-6 border-b border-white/5 shrink-0 flex items-center justify-between">
          <Link to="/airports" className="text-[10px] uppercase tracking-wider flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="size-3" /> Back to Directory
          </Link>
          <div className="text-[10px] uppercase tracking-widest font-mono text-white/50">{airport.icao ?? "NO-ICAO"}</div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
          {/* Identity */}
          <div className="space-y-2">
            <p className="text-label text-primary flex items-center gap-2"><Globe className="size-3" /> {airport.country}</p>
            <h1 className="text-6xl font-mono font-semibold tracking-tighter text-white uppercase">{airport.iata}</h1>
            <p className="text-xl text-muted-foreground">{airport.name}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-8 border-b border-white/5">
            <DataBlock label="Timezone" value={airport.timezone} />
            <DataBlock label="Lat" value={airport.latitude} />
            <DataBlock label="Lng" value={airport.longitude} />
            <DataBlock label="City" value={airport.city} />
          </div>

          {/* Boards */}
          <Tabs defaultValue="departures" className="w-full">
            <TabsList className="w-full bg-background border border-white/5 h-12 p-1 rounded-lg">
              <TabsTrigger value="departures" className="flex-1 text-xs uppercase tracking-wider data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded">
                <PlaneTakeoff className="size-3.5 mr-2" /> Departures
              </TabsTrigger>
              <TabsTrigger value="arrivals" className="flex-1 text-xs uppercase tracking-wider data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded">
                <PlaneLanding className="size-3.5 mr-2" /> Arrivals
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="departures" className="pt-6 outline-none">
              <FlightBoard flights={departures} isDeparture={true} />
            </TabsContent>
            <TabsContent value="arrivals" className="pt-6 outline-none">
              <FlightBoard flights={arrivals} isDeparture={false} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right Map 40% */}
      <div className="w-full lg:w-[40%] h-[40dvh] lg:h-full relative bg-black shrink-0">
        <TrackingMap departure={mapPoint} />
        <div className="absolute inset-0 pointer-events-none shadow-[inset_1px_0_20px_rgba(0,0,0,0.5)] z-10" />
      </div>
    </div>
  );
}

function DataBlock({ label, value }: { label: string, value: any }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-mono text-sm text-white truncate">{value ?? "—"}</p>
    </div>
  );
}

function FlightBoard({ flights, isDeparture }: { flights: FlightDto[], isDeparture: boolean }) {
  if (flights.length === 0) return <div className="text-center py-12 text-sm text-muted-foreground font-mono">No recent operations.</div>;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 md:grid-cols-5 gap-4 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-white/5">
        <div>Flight</div>
        <div className="hidden md:block">Airline</div>
        <div>{isDeparture ? 'To' : 'From'}</div>
        <div>Scheduled</div>
        <div className="text-right">Status</div>
      </div>
      {flights.map(f => (
        <Link key={f.flightNumber ?? Math.random()} to={`/tracking?flight_iata=${f.flightIata ?? f.flightNumber}`} className="grid grid-cols-4 md:grid-cols-5 gap-4 px-4 py-3 text-sm items-center hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-white/5 cursor-pointer">
          <div className="font-mono font-semibold text-white">{f.flightIata ?? f.flightNumber}</div>
          <div className="hidden md:block text-muted-foreground truncate">{f.airlineName ?? "—"}</div>
          <div className="font-mono text-white/80">{isDeparture ? (f.arrivalIata ?? "—") : (f.departureIata ?? "—")}</div>
          <div className="font-mono text-muted-foreground">{isDeparture ? f.departureScheduled : f.arrivalScheduled}</div>
          <div className="text-right">
            <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-widest font-mono ${f.status === 'active' ? 'text-primary' : 'text-muted-foreground'}`}>
              {f.status ?? "Scheduled"}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
