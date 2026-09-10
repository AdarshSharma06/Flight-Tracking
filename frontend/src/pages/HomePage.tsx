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
            <p className="text-[11px] uppercase tracking-[0.3em] text-primary font-semibold drop-shadow-md">Aviation Tracking Platform</p>
            <h1 className="text-5xl md:text-7xl font-semibold tracking-tighter leading-[1.05] drop-shadow-xl text-white">
              Explore Every <br className="hidden md:block" />
              <span className="text-white/80">Flight.</span>
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

      {/* Product Advertisement */}
      <section className="w-full max-w-7xl mx-auto px-6 py-14 sm:py-16 lg:py-20 relative z-10">
        <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 shadow-[0_24px_64px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] p-6 sm:p-8 lg:p-12">
          {/* subtle aurora / grid */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-32 -right-32 h-[520px] w-[520px] rounded-full bg-primary/10 blur-[80px]" />
            <div className="absolute -bottom-32 -left-32 h-[480px] w-[480px] rounded-full bg-cyan-400/5 blur-[70px]" />
            <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          </div>

          <div className="relative flex flex-col gap-10 lg:gap-14">
            
            {/* Top row: Text + Main Visual */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-10 lg:gap-12 items-center">
              
              {/* Text */}
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 backdrop-blur">
                    <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" />
                    <span className="text-[11px] tracking-[0.14em] uppercase font-semibold text-white/80">Platform Capabilities</span>
                  </div>
                  <h2 className="text-[34px] sm:text-[40px] lg:text-[46px] font-semibold tracking-tighter leading-[1.05] text-white">
                    Everything about a flight, <br className="hidden lg:block" />
                    <span className="text-white/60">in one place.</span>
                  </h2>
                  <p className="text-[15px] sm:text-[16px] leading-relaxed text-zinc-400 max-w-[50ch]">
                    Track live telemetry, explore detailed airport layouts, and inspect 3D aircraft cabins through a single, unified interface.
                  </p>
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

              {/* Main Visual */}
              <div className="relative h-[380px] sm:h-[440px] lg:h-[500px] w-full rounded-2xl border border-white/10 bg-[#0a0a0c] shadow-2xl overflow-hidden flex flex-col group ring-1 ring-white/5">
                {/* Header */}
                <div className="flex items-center justify-between px-4 sm:px-5 h-14 border-b border-white/5 bg-zinc-900/50 backdrop-blur-md">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
                      <span className="hidden sm:inline text-xs font-semibold tracking-wider uppercase text-emerald-400">Live Telemetry</span>
                    </div>
                    <div className="hidden sm:block h-4 w-px bg-white/10" />
                    <span className="text-sm font-mono font-medium text-white tracking-tight">LH400</span>
                    <span className="text-xs text-zinc-500">A320neo <span className="hidden sm:inline">• FRA ✈ JFK</span></span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="text-[10px] sm:text-[11px] font-mono text-zinc-400 border border-white/10 px-2 py-1 rounded bg-white/5">FL350</span>
                    <span className="hidden sm:inline text-[11px] font-mono text-zinc-400 border border-white/10 px-2 py-1 rounded bg-white/5">M0.78</span>
                  </div>
                </div>

                {/* Body (Map/Radar) */}
                <div className="relative flex-1 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 to-zinc-950 overflow-hidden flex">
                  {/* Sidebar stats */}
                  <div className="hidden sm:flex flex-col w-48 border-r border-white/5 bg-zinc-950/50 p-4 gap-4 backdrop-blur-sm z-10">
                    <div className="space-y-1">
                      <p className="text-[10px] tracking-widest uppercase text-zinc-500">Altitude</p>
                      <p className="text-lg font-mono text-white">35,000<span className="text-xs text-zinc-500 ml-1">ft</span></p>
                      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden mt-2">
                         <div className="h-full w-[85%] bg-primary rounded-full" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] tracking-widest uppercase text-zinc-500">Speed</p>
                      <p className="text-lg font-mono text-white">482<span className="text-xs text-zinc-500 ml-1">kts</span></p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] tracking-widest uppercase text-zinc-500">Vertical</p>
                      <p className="text-lg font-mono text-emerald-400">+1,200<span className="text-xs text-emerald-900 ml-1">fpm</span></p>
                    </div>
                    <div className="mt-auto space-y-1">
                      <p className="text-[10px] tracking-widest uppercase text-zinc-500">Aircraft</p>
                      <div className="flex items-center gap-2 mt-1">
                         <div className="size-6 rounded bg-white/10 flex items-center justify-center"><Box className="size-3 text-white" /></div>
                         <p className="text-xs font-medium text-white">A320neo</p>
                      </div>
                    </div>
                  </div>

                  {/* Map Area */}
                  <div className="relative flex-1 flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 opacity-[0.15]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
                    
                    {/* Radar sweep effect */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[500px] border border-white/5 rounded-full" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[300px] border border-white/5 rounded-full" />
                    
                    {/* Route line */}
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 300" preserveAspectRatio="none">
                      <path d="M 60 220 C 160 80, 240 80, 340 160" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeDasharray="4 6" />
                      <path d="M 60 220 C 160 80, 240 80, 340 160" fill="none" stroke="rgba(56,189,248,0.9)" strokeWidth="2.5" strokeLinecap="round" className="drop-shadow-[0_0_12px_rgba(56,189,248,0.6)]" strokeDasharray="300" strokeDashoffset="120" />
                    </svg>

                    {/* Departure Node */}
                    <div className="absolute left-[15%] top-[73%] -translate-y-1/2 flex items-center gap-2">
                      <div className="size-3 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)] ring-4 ring-white/10" />
                      <div className="bg-zinc-900/80 backdrop-blur border border-white/10 px-2 py-1 rounded">
                        <p className="text-[10px] font-mono text-white">FRA</p>
                      </div>
                    </div>

                    {/* Arrival Node */}
                    <div className="absolute right-[15%] top-[53%] -translate-y-1/2 flex flex-col items-center gap-2">
                      <div className="size-3 rounded-full bg-zinc-700 ring-4 ring-white/5" />
                      <div className="bg-zinc-900/80 backdrop-blur border border-white/10 px-2 py-1 rounded">
                        <p className="text-[10px] font-mono text-zinc-400">JFK</p>
                      </div>
                    </div>

                    {/* Aircraft Position */}
                    <div className="absolute left-[45%] top-[35%] -translate-x-1/2 -translate-y-1/2 rotate-[25deg]">
                      <div className="size-10 rounded-full bg-white shadow-[0_0_24px_rgba(255,255,255,0.4)] flex items-center justify-center border-2 border-primary group-hover:scale-105 transition-transform">
                        <Plane className="size-5 text-zinc-900 rotate-90" />
                      </div>
                      {/* Telemetry tag */}
                      <div className="absolute left-12 top-0 bg-black/80 backdrop-blur-md border border-white/15 px-2.5 py-1.5 rounded text-nowrap rotate-[-25deg] shadow-xl">
                         <p className="text-[10px] font-mono text-emerald-400">FL350 <span className="text-white ml-1">▲ +1200</span></p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Row: Feature Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
              
              {/* Card 1: Live Tracking */}
              <div className="rounded-[20px] border border-white/10 bg-white/[0.02] overflow-hidden flex flex-col group hover:bg-white/[0.04] transition-colors shadow-lg">
                <div className="h-36 bg-zinc-950 relative overflow-hidden flex items-center justify-center border-b border-white/5">
                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
                  {/* Mini radar sweep */}
                  <div className="relative size-24 rounded-full border border-primary/30 flex items-center justify-center bg-primary/5">
                     <div className="size-12 rounded-full border border-primary/20" />
                     <div className="absolute inset-0 bg-[conic-gradient(from_0deg,transparent_70%,rgba(56,189,248,0.3)_100%)] rounded-full animate-[spin_3s_linear_infinite]" />
                     <Plane className="absolute size-4 text-primary drop-shadow-[0_0_5px_rgba(56,189,248,1)] top-5 right-5 rotate-45" />
                  </div>
                </div>
                <div className="p-5 sm:p-6 flex-1 flex flex-col">
                  <div className="size-9 rounded-xl bg-white text-zinc-900 flex items-center justify-center mb-4 shadow-sm">
                    <Radar className="size-4" />
                  </div>
                  <h3 className="text-[17px] font-semibold text-white mb-2">Live Tracking</h3>
                  <p className="text-[14px] text-zinc-400 leading-relaxed">Real-time radar, precise telemetry, and live ETAs directly from the sky.</p>
                </div>
              </div>

              {/* Card 2: Airport Explorer */}
              <div className="rounded-[20px] border border-white/10 bg-white/[0.02] overflow-hidden flex flex-col group hover:bg-white/[0.04] transition-colors shadow-lg">
                <div className="h-36 bg-zinc-950 relative overflow-hidden flex items-center justify-center border-b border-white/5">
                  {/* Stylized runways */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-zinc-900 to-zinc-950" />
                  <div className="relative w-[140px] h-[90px] rotate-[-12deg] group-hover:scale-105 transition-transform duration-500">
                    <div className="absolute top-4 left-0 w-full h-3.5 bg-zinc-800 border border-white/10 rounded-sm" />
                    <div className="absolute top-12 left-6 w-10/12 h-3.5 bg-zinc-800 border border-white/10 rounded-sm" />
                    <div className="absolute top-8 left-10 size-5 rounded-full bg-primary/20 border border-primary flex items-center justify-center">
                      <div className="size-2 rounded-full bg-primary shadow-[0_0_8px_rgba(56,189,248,1)]" />
                    </div>
                    {/* Terminal UI hint */}
                    <div className="absolute -bottom-2 -right-4 bg-zinc-900 border border-white/10 px-2 py-1 rounded shadow-xl backdrop-blur-md">
                      <p className="text-[9px] font-mono text-zinc-300">Terminal 4 • 12 Gates</p>
                    </div>
                  </div>
                </div>
                <div className="p-5 sm:p-6 flex-1 flex flex-col">
                  <div className="size-9 rounded-xl bg-white/5 border border-white/10 text-white flex items-center justify-center mb-4">
                    <Layers className="size-4" />
                  </div>
                  <h3 className="text-[17px] font-semibold text-white mb-2">Airport Explorer</h3>
                  <p className="text-[14px] text-zinc-400 leading-relaxed">Detailed runway layouts, live departure boards, and local weather.</p>
                </div>
              </div>

              {/* Card 3: Aircraft & Cabin */}
              <div className="rounded-[20px] border border-white/10 bg-white/[0.02] overflow-hidden flex flex-col group hover:bg-white/[0.04] transition-colors shadow-lg">
                <div className="h-36 bg-zinc-950 relative overflow-hidden flex items-center justify-center border-b border-white/5">
                   {/* Abstract aircraft cabin seating */}
                   <div className="w-36 flex flex-col gap-2.5 rotate-90 scale-[1.3] group-hover:translate-x-2 transition-transform duration-500">
                     <div className="h-3 w-full bg-white/10 rounded-t-full border border-white/5" />
                     <div className="flex justify-between w-full px-1.5">
                        <div className="flex gap-1.5"><div className="size-2 bg-zinc-700 rounded-[1px]"/><div className="size-2 bg-zinc-700 rounded-[1px]"/><div className="size-2 bg-zinc-700 rounded-[1px]"/></div>
                        <div className="flex gap-1.5"><div className="size-2 bg-zinc-700 rounded-[1px]"/><div className="size-2 bg-zinc-700 rounded-[1px]"/><div className="size-2 bg-zinc-700 rounded-[1px]"/></div>
                     </div>
                     <div className="flex justify-between w-full px-1.5">
                        <div className="flex gap-1.5"><div className="size-2 bg-primary/80 rounded-[1px] shadow-[0_0_5px_rgba(56,189,248,0.5)]"/><div className="size-2 bg-zinc-700 rounded-[1px]"/><div className="size-2 bg-zinc-700 rounded-[1px]"/></div>
                        <div className="flex gap-1.5"><div className="size-2 bg-zinc-700 rounded-[1px]"/><div className="size-2 bg-zinc-700 rounded-[1px]"/><div className="size-2 bg-zinc-700 rounded-[1px]"/></div>
                     </div>
                     <div className="flex justify-between w-full px-1.5">
                        <div className="flex gap-1.5"><div className="size-2 bg-zinc-700 rounded-[1px]"/><div className="size-2 bg-zinc-700 rounded-[1px]"/><div className="size-2 bg-zinc-700 rounded-[1px]"/></div>
                        <div className="flex gap-1.5"><div className="size-2 bg-zinc-700 rounded-[1px]"/><div className="size-2 bg-zinc-700 rounded-[1px]"/><div className="size-2 bg-zinc-700 rounded-[1px]"/></div>
                     </div>
                   </div>
                </div>
                <div className="p-5 sm:p-6 flex-1 flex flex-col">
                  <div className="size-9 rounded-xl bg-primary/15 border border-primary/20 text-primary flex items-center justify-center mb-4">
                    <Armchair className="size-4" />
                  </div>
                  <h3 className="text-[17px] font-semibold text-white mb-2">Aircraft & Cabin</h3>
                  <p className="text-[14px] text-zinc-400 leading-relaxed">Interactive 3D aircraft models and detailed 186-seat cabin maps.</p>
                </div>
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
