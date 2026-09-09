import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { airportService } from "@/services/airport.service";
import { ApiError } from "@/services/api";
import type { AirportDto } from "@/types/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Building2, Globe, AlertCircle, Loader2, MapPin } from "lucide-react";

const EXAMPLES = ["DEL", "BOM", "LHR", "JFK", "DXB", "SIN", "CDG", "FRA"];

export function AirportsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AirportDto[]>([]);
  const [selected, setSelected] = useState<AirportDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const doSearch = useCallback(async (q?: string) => {
    const code = (q ?? query).trim();
    if (!code) {
      setError("Enter an IATA code, airport name, or city.");
      return;
    }
    setError(null);
    setLoading(true);
    setSelected(null);
    setSearched(true);
    try {
      // If it looks like a 3-letter IATA code, try direct lookup first
      if (/^[A-Za-z]{3}$/.test(code)) {
        try {
          const direct = await airportService.getByIata(code.toUpperCase());
          setSelected(direct);
          setResults([]);
          setLoading(false);
          return;
        } catch {
          // Fall through to search
        }
      }
      const res = await airportService.search(code);
      setResults(res);
      if (res.length === 0) {
        setError("No airports found matching your search.");
      }
    } catch (err: any) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Search failed.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    doSearch();
  };

  return (
    <div className="w-full min-h-[100dvh] pt-20 pb-24 bg-background">
      <div className="relative w-full h-[40dvh] flex items-center justify-center overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0">
          <img src="/images/airport_bg.jpg" alt="Airport Tarmac" className="w-full h-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>

        <div className="relative z-10 w-full max-w-4xl mx-auto px-6 text-center space-y-6">
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tighter text-white">Global Airports</h1>
          <p className="text-sm text-muted-foreground uppercase tracking-widest font-mono">Directory & Live Operations</p>

          <form onSubmit={handleSubmit} className="max-w-xl mx-auto flex items-center mt-8 glass-panel rounded p-2 focus-within:border-primary/50 transition-colors">
            <div className="flex-1 flex items-center px-4 gap-3">
              <Search className="size-5 text-muted-foreground shrink-0" />
              <Input
                placeholder="Search by IATA, name, or city (e.g., London)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="border-0 bg-transparent text-white placeholder:text-white/40 focus-visible:ring-0 text-base h-12 shadow-none"
              />
            </div>
            <Button type="submit" disabled={loading} className="h-12 w-32 uppercase tracking-wider text-xs font-semibold">
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Search"}
            </Button>
          </form>

          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {EXAMPLES.map(code => (
              <Button key={code} type="button" variant="outline" size="sm" className="h-7 text-[10px] font-mono border-white/10 hover:border-white/30" onClick={() => { setQuery(code); doSearch(code); }}>
                {code}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 pt-16 space-y-6">

        {error && (
          <div className="max-w-xl mx-auto rounded p-4 border border-destructive/30 bg-destructive/10 flex items-center gap-3">
            <AlertCircle className="size-5 text-destructive shrink-0" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}

        {/* Direct match result */}
        {selected && !loading && (
          <div className="glass-panel p-8 rounded-xl flex flex-col md:flex-row items-center justify-between gap-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="size-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-1">
                  <Building2 className="size-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-4xl font-mono font-semibold text-white">{selected.iata}</h3>
                  <p className="text-xl text-white/90">{selected.name}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20">Location</span>
                  <span className="text-white flex items-center gap-1.5"><Globe className="size-3 text-muted-foreground" /> {selected.city ? `${selected.city}, ` : ""}{selected.country} {selected.countryIso2}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20">Coordinates</span>
                  <span className="text-white font-mono">{selected.latitude?.toFixed(3)}, {selected.longitude?.toFixed(3)}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20">Timezone</span>
                  <span className="text-white font-mono">{selected.timezone}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20">ICAO</span>
                  <span className="text-white font-mono">{selected.icao || "—"}</span>
                </div>
              </div>
            </div>

            <Button size="lg" className="w-full md:w-auto uppercase tracking-widest text-xs" onClick={() => navigate(`/airports/${selected.iata}`)}>
              View Operations
            </Button>
          </div>
        )}

        {/* Multiple search results */}
        {!selected && results.length > 0 && !loading && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">{results.length} airports found</p>
            {results.map((r) => (
              <div
                key={r.iata}
                className="glass-panel p-5 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => navigate(`/airports/${r.iata}`)}
              >
                <div className="flex items-start gap-4">
                  <div className="size-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                    <Building2 className="size-5 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg font-semibold text-white">{r.iata}</span>
                      {r.icao && <span className="font-mono text-[10px] text-muted-foreground">{r.icao}</span>}
                    </div>
                    <p className="text-sm text-white/90">{r.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="size-3" /> {r.city ?? "—"}, {r.country ?? "—"}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="text-xs border-white/10">
                  View
                </Button>
              </div>
            ))}
          </div>
        )}

        {!selected && results.length === 0 && !loading && !error && searched && (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="size-12 opacity-20 mx-auto mb-4" />
            <p className="font-mono text-sm uppercase tracking-widest">No results found</p>
          </div>
        )}

        {!selected && results.length === 0 && !loading && !error && !searched && (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="size-12 opacity-20 mx-auto mb-4" />
            <p className="font-mono text-sm uppercase tracking-widest">Search for an airport</p>
          </div>
        )}
      </div>
    </div>
  );
}
