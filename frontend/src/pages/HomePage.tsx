import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Plane, Search, MapPinned, Ticket, Building2, Cpu, TowerControl, Sparkles, ArrowRight, ShieldCheck, Info, Lock, Compass } from "lucide-react";

export function HomePage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [flightQuery, setFlightQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = flightQuery.trim();
    if (!q) {
      setError("Enter a flight identifier (e.g., flight_iata like LH400).");
      return;
    }
    // Basic IATA-like validation: allow alphanumeric, length 2-10
    if (q.length < 2 || q.length > 20) {
      setError("Flight identifier should be 2–20 characters.");
      return;
    }
    setError(null);
    // Navigate to tracking with query param — actual API call lives in tracking page (Part 2)
    navigate(`/tracking?flight_iata=${encodeURIComponent(q)}`);
  };

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-center">
        <div className="space-y-6">
          <Badge variant="secondary" className="gap-1.5">
            <Sparkles className="size-3.5" />
            AviationStack • Open-Meteo • PostgreSQL
          </Badge>
          <div className="space-y-3">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.05]">
              Track Flights.
              <br />
              <span className="text-primary">Explore Airports.</span>
              <br />
              Stay Ahead.
            </h1>
            <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-[60ch]">
              A modern flight tracking platform built on Spring Boot and React. Search live flight data, explore airports, manage bookings, and review ATC telemetry — all through a secure JWT-powered API.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/tracking" className={cn(buttonVariants({ size: "lg" }), "gap-2")}>
              <Search className="size-4" />
              Track a flight
              <ArrowRight className="size-4" />
            </Link>
            {!isAuthenticated ? (
              <Link to="/register" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
                Create account
              </Link>
            ) : (
              <Link to="/booking" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2")}>
                <Ticket className="size-4" />
                Go to booking
              </Link>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> JWT secured</span>
            <Separator orientation="vertical" className="h-4" />
            <span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" /> Role-based access</span>
            <Separator orientation="vertical" className="h-4" />
            <span>REST • JPA • Flyway</span>
          </div>
        </div>

        {/* Visual / Search card side */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plane className="size-4 text-primary" />
              Live Flight Search
            </CardTitle>
            <CardDescription>
              Search by flight identifier (<code className="bg-muted px-1 py-0.5 rounded text-xs">flight_iata</code>). Backend: <code className="bg-muted px-1 py-0.5 rounded text-xs">GET /api/flights/search</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSearch} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="flightSearch">Flight identifier</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      id="flightSearch"
                      placeholder="e.g., LH400, BA2490, flight_iata"
                      value={flightQuery}
                      onChange={(e) => setFlightQuery(e.target.value)}
                      className="pl-9"
                      aria-describedby="flightHelp"
                    />
                  </div>
                  <Button type="submit" className="gap-1.5 shrink-0">
                    Search
                    <ArrowRight className="size-4 hidden sm:inline" />
                  </Button>
                </div>
                <p id="flightHelp" className="text-xs text-muted-foreground">
                  Accepts backend param <code className="bg-muted px-1 rounded">flight_iata</code>. Other filters (dep_iata, arr_iata, airline_iata, flight_status, limit, sortBy, order) available via API.
                </p>
              </div>
              {error && (
                <Alert variant="destructive">
                  <Info className="size-4" />
                  <AlertTitle>Check your input</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {!isAuthenticated && (
                <Alert>
                  <Lock className="size-4" />
                  <AlertTitle>Authentication required for live data</AlertTitle>
                  <AlertDescription className="text-xs leading-relaxed">
                    Flight search UI is available to guests, but the live AviationStack data requires a JWT. <Link to="/login" className="underline underline-offset-2">Login</Link> to fetch results — otherwise you’ll be redirected to tracking’s placeholder.
                  </AlertDescription>
                </Alert>
              )}
            </form>
            <div className="rounded-lg bg-muted/40 border p-3 space-y-2">
              <p className="text-xs font-medium flex items-center gap-1.5"><Compass className="size-3.5" /> What happens next?</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                <li>Submission navigates to <code className="bg-background px-1 rounded border">/tracking?flight_iata=...</code></li>
                <li>Tracking page (Part 2) will call <code className="bg-background px-1 rounded border">GET /api/flights/search?flight_iata=</code> with Bearer token</li>
                <li>No fake flight data is shown here — live results only from backend</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Guest / user distinction */}
      <section className="grid md:grid-cols-2 gap-4">
        <Card size="sm" className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Search className="size-4 text-primary" /> Explore as guest</CardTitle>
            <CardDescription className="text-xs">You can browse the product, try the search UI, and view airport/aircraft information structure — without an account.</CardDescription>
          </CardHeader>
        </Card>
        <Card size="sm" className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> Unlock with login</CardTitle>
            <CardDescription className="text-xs">Booking, profile, ATC dashboards and live weather/flight data are authenticated. JWT is stored via <code className="bg-muted px-1 rounded">flight_tracking_token</code>.</CardDescription>
          </CardHeader>
        </Card>
      </section>

      {/* Feature overview */}
      <section id="about" className="space-y-6 scroll-mt-20">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Everything for aviation operations</h2>
          <p className="text-sm text-muted-foreground max-w-[70ch]">Six core capabilities — built incrementally. Part 1 establishes the shell; feature pages remain placeholders until Part 2/3.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary"><Plane className="size-5" /></div>
              <CardTitle className="text-base">Flight Tracking</CardTitle>
              <CardDescription>Live position, status, telemetry, route. Endpoints: <code className="bg-muted px-1 rounded text-xs">/api/flights/search</code>, <code className="bg-muted px-1 rounded text-xs">/api/flights/{`{id}`}/tracking</code>.</CardDescription>
            </CardHeader>
            <CardContent><Badge variant="secondary">Authenticated</Badge></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary"><Ticket className="size-5" /></div>
              <CardTitle className="text-base">Flight Booking</CardTitle>
              <CardDescription>Create and list personal bookings. <code className="bg-muted px-1 rounded text-xs">POST /api/bookings</code>, <code className="bg-muted px-1 rounded text-xs">GET /api/bookings</code> with pagination.</CardDescription>
            </CardHeader>
            <CardContent><Badge variant="secondary">Authenticated</Badge></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary"><Building2 className="size-5" /></div>
              <CardTitle className="text-base">Airport Intelligence</CardTitle>
              <CardDescription>Lookup by IATA, departures/arrivals. <code className="bg-muted px-1 rounded text-xs">GET /api/airports/{`{iata}`}</code> family.</CardDescription>
            </CardHeader>
            <CardContent><Badge variant="secondary">Authenticated</Badge></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary"><MapPinned className="size-5" /></div>
              <CardTitle className="text-base">Aircraft & 3D Viewer</CardTitle>
              <CardDescription>Aircraft registry and future 3D visualization. Placeholder for Part 3. No backend aircraft catalog yet — data via flight DTOs.</CardDescription>
            </CardHeader>
            <CardContent><Badge variant="outline">Coming soon</Badge></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary"><TowerControl className="size-5" /></div>
              <CardTitle className="text-base">ATC Dashboard</CardTitle>
              <CardDescription>Telemetry & anomaly records, role-gated. <code className="bg-muted px-1 rounded text-xs">/api/atc/**</code> requires <code className="bg-muted px-1 rounded text-xs">ATC_EMPLOYEE</code>.</CardDescription>
            </CardHeader>
            <CardContent><Badge variant="outline">ATC only</Badge></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary"><Cpu className="size-5" /></div>
              <CardTitle className="text-base">AI Assistance</CardTitle>
              <CardDescription>Future AI search, explanations, and recommendations. Navigation placeholder only — no AI implementation in Part 1.</CardDescription>
            </CardHeader>
            <CardContent><Badge variant="outline">Placeholder</Badge></CardContent>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-2xl border bg-card p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <h3 className="text-xl font-semibold tracking-tight">Ready to get on board?</h3>
          <p className="text-sm text-muted-foreground max-w-[50ch]">Create an account to access bookings, profile, and live flight data — or jump straight to tracking if you’re already authenticated.</p>
        </div>
        <div className="flex gap-3 shrink-0">
          <Link to="/register" className={cn(buttonVariants({ size: "lg" }), "gap-2")}>
            Create account <ArrowRight className="size-4" />
          </Link>
          <Link to="/tracking" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
            Tracking
          </Link>
        </div>
      </section>

      <div className="text-xs text-muted-foreground text-center">
        No fake flight data • No AI in Part 1 • Backend is source of truth — frontend role checks are UI-only.
      </div>
    </div>
  );
}
