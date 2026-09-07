import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Plane, MapPin, Cpu, Target } from "lucide-react";

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
