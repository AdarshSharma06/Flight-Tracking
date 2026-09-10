import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Plane, MapPin, Cpu, Target, Box, Armchair, Layers, Radar } from "lucide-react";

export function HomePage() {
  const navigate = useNavigate();
  const [flightQuery, setFlightQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = flightQuery.trim();
    if (!q) return;
    navigate(`/tracking?flight_iata=${encodeURIComponent(q)}`);
  };

  return (
    <div className="w-full flex-1 flex flex-col">
      {/* Hero Section */}
      <section className="relative min-h-[100dvh] w-full flex items-center justify-center overflow-hidden pt-20">
        <div className="absolute inset-0 z-0">
          <img src="/images/home_bg.jpg" alt="Atmospheric Clouds" className="w-full h-full object-cover object-center opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-background/50" />
        </div>
        
        <div className="relative z-10 w-full max-w-5xl mx-auto px-6 flex flex-col items-center text-center space-y-8 mt-[-10dvh]">
          <div className="space-y-4">
            <p className="text-[11px] uppercase tracking-[0.3em] text-primary font-semibold drop-shadow-md">Global Aviation Intelligence</p>
            <h1 className="text-5xl md:text-7xl font-semibold tracking-tighter leading-[1.05] drop-shadow-xl text-white">
              Command the <br className="hidden md:block" />
              <span className="text-white/80">Sky.</span>
            </h1>
          </div>
          
          <div className="w-full max-w-lg mt-8 glass-panel-heavy rounded-lg p-2 shadow-2xl">
            <form onSubmit={handleSearch} className="flex items-center">
              <div className="flex-1 flex items-center px-4 gap-3">
                <Plane className="size-5 text-muted-foreground shrink-0" />
                <Input
                  placeholder="Enter Flight Number (e.g., LH400)"
                  value={flightQuery}
                  onChange={(e) => setFlightQuery(e.target.value)}
                  className="border-0 bg-transparent text-white placeholder:text-white/40 focus-visible:ring-0 text-base h-12 shadow-none font-mono"
                />
              </div>
              <Button type="submit" size="lg" className="h-12 px-8 rounded-md bg-white text-black hover:bg-white/90 font-semibold uppercase tracking-wider text-xs">
                Track
              </Button>
            </form>
          </div>
        </div>
      </section>

      {/* Product Advertisement — Aviation Command Center */}
      <section className="w-full max-w-7xl mx-auto px-6 py-14 sm:py-16 lg:py-20 relative z-10">
        <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 shadow-[0_24px_64px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]">
          {/* subtle aurora / grid */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-32 -right-32 h-[520px] w-[520px] rounded-full bg-primary/10 blur-[80px]" />
            <div className="absolute -bottom-32 -left-32 h-[480px] w-[480px] rounded-full bg-cyan-400/5 blur-[70px]" />
            <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          </div>

          <div className="relative grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-8 lg:gap-6 p-6 sm:p-8 lg:p-10 items-center">
            {/* Left — copy */}
            <div className="space-y-6 lg:pr-4">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 backdrop-blur">
                  <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" />
                  <span className="text-[11px] tracking-[0.14em] uppercase font-semibold text-white/80">Operational Intelligence</span>
                </div>
                <h2 className="text-[32px] sm:text-[38px] lg:text-[44px] font-semibold tracking-tighter leading-[0.95] text-white">
                  Every flight —<br />
                  live, explorable,<br />
                  <span className="text-white/55">inspectable.</span>
                </h2>
                <p className="text-[15px] leading-relaxed text-zinc-400 max-w-[52ch]">
                  Live radar, global airport intelligence and a true A320neo cabin — one platform for how aviation actually works.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur hover:bg-white/[0.06] hover:border-white/15 transition-colors">
                  <div className="size-9 rounded-xl bg-white text-zinc-900 flex items-center justify-center mb-3 shadow-sm">
                    <Radar className="size-4" />
                  </div>
                  <h3 className="text-sm font-medium text-white leading-none">Live Tracking</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed mt-1.5">Real-time radar, telemetry and ETAs.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur hover:bg-white/[0.06] hover:border-white/15 transition-colors">
                  <div className="size-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                    <Layers className="size-4 text-white" />
                  </div>
                  <h3 className="text-sm font-medium text-white leading-none">Airport Explorer</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed mt-1.5">Runways to gates, boards + weather.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur hover:bg-white/[0.06] hover:border-white/15 transition-colors">
                  <div className="size-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center mb-3">
                    <Box className="size-4 text-primary" />
                  </div>
                  <h3 className="text-sm font-medium text-white leading-none">Aircraft & Cabin</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed mt-1.5">A320neo 3D + 186-seat explorer.</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button size="lg" className="h-11 px-6 rounded-full bg-white text-zinc-900 hover:bg-zinc-100 font-medium" onClick={() => navigate("/tracking")}>
                  Track a flight <ArrowRight className="size-4" />
                </Button>
                <Button variant="outline" size="lg" className="h-11 px-6 rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white backdrop-blur" onClick={() => navigate("/aircraft")}>
                  Explore aircraft
                </Button>
              </div>
              <div className="flex items-center gap-4 pt-1 text-[11px] text-zinc-500">
                <span className="inline-flex items-center gap-1.5"><span className="size-1 rounded-full bg-zinc-500" /> No API key for tracking</span>
                <span className="hidden sm:inline-flex items-center gap-1.5"><span className="size-1 rounded-full bg-zinc-500" /> OSM + Overpass live</span>
              </div>
            </div>

            {/* Right — layered product visualization */}
            <div className="relative lg:h-[480px] h-[380px] sm:h-[420px] w-full">
              {/* glow behind */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-[86%] w-[92%] rounded-[24px] bg-gradient-to-br from-primary/15 via-cyan-400/10 to-transparent blur-2xl opacity-60" />
              </div>

              {/* Main dashboard card */}
              <div className="absolute inset-2 sm:inset-4 lg:inset-3 rounded-[22px] overflow-hidden border border-white/10 bg-zinc-900/70 backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] flex flex-col">
                {/* card header */}
                <div className="flex items-center justify-between px-4 sm:px-5 h-12 border-b border-white/5 bg-white/[0.02]">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-500/20 px-2.5 py-1">
                      <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[11px] font-semibold tracking-widest uppercase text-emerald-300">Live</span>
                    </span>
                    <span className="text-sm font-mono font-medium text-white tracking-tight">LH400</span>
                    <span className="hidden sm:inline text-xs text-zinc-500">FRA → JFK • A320neo</span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500 hidden sm:block">FL350 • M0.78</span>
                </div>

                {/* map / route area */}
                <div className="relative flex-1 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 overflow-hidden">
                  <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.9) 1px, transparent 0)", backgroundSize: "18px 18px" }} />
                  {/* route line */}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 220" preserveAspectRatio="none">
                    <path d="M 40 140 C 140 40, 260 40, 360 100" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" strokeDasharray="6 6" />
                    <path d="M 40 140 C 140 40, 260 40, 360 100" fill="none" stroke="rgba(56,189,248,0.9)" strokeWidth="2.2" strokeLinecap="round" className="drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
                  </svg>
                  {/* departure */}
                  <div className="absolute left-[8%] top-[62%] -translate-y-1/2 flex flex-col items-center gap-1.5">
                    <span className="size-3 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.6)] ring-4 ring-white/10" />
                    <span className="rounded-full bg-zinc-900 border border-white/10 px-2 py-0.5 text-[10px] font-mono font-medium text-white">FRA</span>
                  </div>
                  {/* arrival */}
                  <div className="absolute right-[8%] top-[44%] -translate-y-1/2 flex flex-col items-center gap-1.5">
                    <span className="size-3 rounded-full bg-primary shadow-[0_0_10px_rgba(56,189,248,0.6)] ring-4 ring-primary/20" />
                    <span className="rounded-full bg-white text-zinc-900 px-2 py-0.5 text-[10px] font-mono font-medium">JFK</span>
                  </div>
                  {/* aircraft along route */}
                  <div className="absolute left-[52%] top-[28%] -translate-x-1/2 -translate-y-1/2 rotate-[18deg]">
                    <div className="size-9 rounded-full bg-white shadow-[0_8px_20px_rgba(0,0,0,0.4)] flex items-center justify-center border border-zinc-200">
                      <Plane className="size-4 text-zinc-900 rotate-90" />
                    </div>
                  </div>
                  {/* subtle aircraft silhouette watermark */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.04] pointer-events-none">
                    <Plane className="size-56 text-white rotate-[-8deg]" strokeWidth={1} />
                  </div>
                </div>

                {/* metrics */}
                <div className="grid grid-cols-3 divide-x divide-white/5 border-t border-white/5 bg-black/20 backdrop-blur">
                  <div className="px-4 sm:px-5 py-3">
                    <p className="text-[10px] tracking-widest uppercase text-zinc-500">Altitude</p>
                    <p className="text-sm font-mono font-medium text-white">35,000<span className="text-xs text-zinc-500 ml-1">ft</span></p>
                  </div>
                  <div className="px-4 sm:px-5 py-3">
                    <p className="text-[10px] tracking-widest uppercase text-zinc-500">Ground speed</p>
                    <p className="text-sm font-mono font-medium text-white">482<span className="text-xs text-zinc-500 ml-1">kts</span></p>
                  </div>
                  <div className="px-4 sm:px-5 py-3">
                    <p className="text-[10px] tracking-widest uppercase text-zinc-500">Est. arrival</p>
                    <p className="text-sm font-mono font-medium text-white">14:42<span className="text-xs text-zinc-500 ml-1">UTC</span></p>
                  </div>
                </div>
              </div>

              {/* floating airport card */}
              <div className="absolute -left-2 sm:left-0 top-6 sm:top-8 w-[168px] sm:w-[188px] rounded-2xl border border-white/10 bg-zinc-900/80 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.45)] p-3 hidden sm:flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] tracking-widest uppercase text-zinc-500">Airport Explorer</span>
                  <span className="size-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center"><MapPin className="size-3 text-white" /></span>
                </div>
                <div>
                  <p className="text-sm font-medium text-white leading-none">DEL</p>
                  <p className="text-[11px] text-zinc-500 leading-tight">Indira Gandhi Intl • 6,273 objects</p>
                </div>
                <div className="flex gap-1.5 pt-1">
                  <span className="rounded-full bg-primary/15 border border-primary/20 px-2 py-0.5 text-[10px] font-mono text-primary">RWY</span>
                  <span className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] font-mono text-zinc-300">Gates</span>
                  <span className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] font-mono text-zinc-300">T1</span>
                </div>
              </div>

              {/* floating seat/cabin card */}
              <div className="absolute -right-2 sm:right-0 bottom-8 sm:bottom-10 w-[172px] sm:w-[190px] rounded-2xl border border-white/10 bg-zinc-900/80 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.45)] p-3 hidden sm:flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] tracking-widest uppercase text-zinc-500">Cabin</span>
                  <span className="size-6 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center"><Armchair className="size-3 text-primary" /></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-7 rounded-lg bg-white text-zinc-900 flex items-center justify-center"><Box className="size-3.5" /></span>
                  <div>
                    <p className="text-xs font-medium text-white leading-none">A320neo</p>
                    <p className="text-[11px] font-mono text-zinc-500">6E1234 • 186 seats</p>
                  </div>
                </div>
                <div className="grid grid-cols-6 gap-1 pt-1">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <span key={i} className={`h-2 rounded-sm ${i === 5 ? "bg-primary" : "bg-white/10"}`} />
                  ))}
                </div>
                <p className="text-[10px] text-zinc-500">Seat 12A • Window • Left</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section className="w-full max-w-7xl mx-auto px-6 py-24 z-10 relative bg-background">
        <div className="grid grid-cols-1 md:grid-cols-3 md:grid-rows-2 gap-4 auto-rows-[300px]">
          
          {/* Tracking */}
          <Link to="/tracking" className="md:col-span-2 md:row-span-2 group relative rounded-xl overflow-hidden glass-panel flex flex-col justify-end p-8 transition-all hover:border-primary/50">
            <div className="absolute top-8 right-8 size-12 rounded-full bg-white/5 flex items-center justify-center backdrop-blur-md group-hover:scale-110 transition-transform">
              <ArrowRight className="size-5 text-white" />
            </div>
            <div className="space-y-3 relative z-10">
              <div className="size-10 rounded bg-primary/20 flex items-center justify-center mb-4">
                <Target className="size-5 text-primary" />
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-white">Live Tracking</h2>
              <p className="text-muted-foreground max-w-[45ch]">Real-time operational telemetry, position mapping, and precise arrival estimations derived directly from live radar data.</p>
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent z-0" />
          </Link>

          {/* Airports */}
          <Link to="/airports" className="group relative rounded-xl overflow-hidden glass-panel p-6 flex flex-col transition-all hover:border-primary/50">
            <div className="size-10 rounded bg-white/5 flex items-center justify-center mb-4">
              <MapPin className="size-5 text-white" />
            </div>
            <h3 className="text-xl font-semibold tracking-tight text-white mb-2">Airports</h3>
            <p className="text-sm text-muted-foreground">Global airport directory with live departure and arrival boards.</p>
            <div className="mt-auto self-end opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowRight className="size-4 text-primary" />
            </div>
          </Link>

          {/* AI Intelligence */}
          <Link to="/ai" className="group relative rounded-xl overflow-hidden glass-panel p-6 flex flex-col transition-all hover:border-primary/50 bg-gradient-to-br from-background to-primary/5">
            <div className="size-10 rounded bg-primary/10 flex items-center justify-center mb-4">
              <Cpu className="size-5 text-primary" />
            </div>
            <h3 className="text-xl font-semibold tracking-tight text-white mb-2">Intelligence</h3>
            <p className="text-sm text-muted-foreground">Conversational analysis of operational data and flight paths.</p>
            <div className="mt-auto self-end opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowRight className="size-4 text-primary" />
            </div>
          </Link>
          
        </div>
      </section>
    </div>
  );
}
