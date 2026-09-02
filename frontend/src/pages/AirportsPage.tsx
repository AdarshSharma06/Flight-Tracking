import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { airportService } from "@/services/airport.service";
import { ApiError } from "@/services/api";
import type { AirportDto } from "@/types/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Building2, MapPin, AlertCircle, ArrowRight } from "lucide-react";

const examples = ["DEL", "BOM", "LHR", "JFK", "DXB", "SIN", "CDG", "FRA"];

export function AirportsPage() {
  const navigate = useNavigate();
  const [iata, setIata] = useState("");
  const [result, setResult] = useState<AirportDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSearch = async () => {
    const code = iata.trim().toUpperCase();
    if (!/^[A-Za-z]{3}$/.test(code)) {
      setError("Enter a 3-letter IATA code.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await airportService.getByIata(code);
      setResult(res);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Building2 className="size-6 text-primary" /> Airports</h1>
        <p className="text-sm text-muted-foreground">Lookup via <code className="bg-muted px-1 rounded">GET /api/airports/{"{iata}"}</code>. No list endpoint — IATA search only.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Search className="size-4" /> Airport lookup</CardTitle>
          <CardDescription>Backend supports single IATA lookup — not a collection. Enter 3 letters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 max-w-md">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="iata">IATA code</Label>
              <Input id="iata" placeholder="DEL" maxLength={3} value={iata} onChange={(e) => setIata(e.target.value.toUpperCase())} className="font-mono uppercase" />
            </div>
            <div className="flex items-end"><Button onClick={doSearch} disabled={loading} className="gap-2">{loading ? <Skeleton className="size-4 rounded-full" /> : <Search className="size-4" />}Search</Button></div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {examples.map((code) => (
              <Button key={code} variant="outline" size="sm" className="h-7 text-xs font-mono" onClick={() => { setIata(code); }}>{code}</Button>
            ))}
          </div>
          {error && <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Lookup error</AlertTitle><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
          {loading && <Skeleton className="h-24 w-full" />}
          {result && !loading && (
            <Card className="bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><MapPin className="size-4" /> {result.name} <Badge variant="secondary" className="font-mono">{result.iata}</Badge></CardTitle>
                <CardDescription>{result.city ? `${result.city}, ` : ""}{result.country ?? ""} {result.icao ? `• ICAO ${result.icao}` : ""} {result.countryIso2 ? `• ${result.countryIso2}` : ""}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Timezone</span><span>{result.timezone ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Coordinates</span><span>{result.latitude != null && result.longitude != null ? `${result.latitude.toFixed(3)}, ${result.longitude.toFixed(3)}` : "—"}</span></div>
                <Button size="sm" className="w-full gap-2 mt-2" onClick={() => navigate(`/airports/${result.iata}`)}>View details <ArrowRight className="size-4" /></Button>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <Alert>
        <Building2 className="size-4" />
        <AlertTitle className="text-xs">No hardcoded airport list</AlertTitle>
        <AlertDescription className="text-xs">There is no <code className="bg-background px-1 rounded border">GET /api/airports</code> — only IATA lookups. Type DEL, BOM, LHR, etc. and view <code className="bg-background px-1 rounded border">/airports/:iata</code> for departures, arrivals, weather, and map.</AlertDescription>
      </Alert>

      <div className="grid md:grid-cols-3 gap-4 text-xs text-muted-foreground">
        <div className="rounded-lg border p-3">Try <Link to="/airports/DEL" className="text-primary underline">DEL</Link> • Delhi</div>
        <div className="rounded-lg border p-3">Try <Link to="/airports/JFK" className="text-primary underline">JFK</Link> • New York</div>
        <div className="rounded-lg border p-3">Try <Link to="/airports/DXB" className="text-primary underline">DXB</Link> • Dubai</div>
      </div>
    </div>
  );
}
