import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Radar, AlertTriangle, Radio, Database, ShieldAlert, CheckCircle2, Sparkles, Loader2, Bot } from "lucide-react";
import { atcService } from "@/services/atc.service";
import type { TelemetryResponse, AnomalyResponse, AtcExplanationResponse } from "@/types/api";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function AtcPage() {
  const { user, hasRole } = useAuth();
  
  const [telemetry, setTelemetry] = useState<TelemetryResponse[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI Explanation State
  const [explainingId, setExplainingId] = useState<number | null>(null);
  const [explanation, setExplanation] = useState<AtcExplanationResponse | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  useEffect(() => {
    if (hasRole("ATC_EMPLOYEE")) {
      fetchData();
    }
  }, [hasRole]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [telRes, anRes] = await Promise.all([
        atcService.listTelemetryPaginated(undefined, 0, 20),
        atcService.listAnomaliesPaginated(undefined, 0, 20)
      ]);
      setTelemetry(telRes.content);
      setAnomalies(anRes.content);
    } catch (e: any) {
      setError(e.message || "Failed to load ATC data");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id: number, status: string) => {
    try {
      await atcService.updateAnomalyStatus(id, status);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleExplain = async (id: number) => {
    setExplainingId(id);
    setShowExplanation(true);
    setExplanation(null);
    try {
      const res = await atcService.explainAnomaly(id);
      setExplanation(res);
    } catch (e) {
      console.error(e);
      setShowExplanation(false);
    } finally {
      setExplainingId(null);
    }
  };

  if (!hasRole("ATC_EMPLOYEE")) {
    return (
      <div className="w-full min-h-[100dvh] pt-20 flex items-center justify-center bg-background">
        <div className="glass-panel p-8 rounded-xl max-w-md text-center space-y-4 border-destructive/30">
          <ShieldAlert className="size-12 text-destructive mx-auto" />
          <h1 className="text-xl font-mono text-white">ACCESS DENIED</h1>
          <p className="text-sm text-muted-foreground">You do not have the required ATC_EMPLOYEE clearance to access this terminal.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[100dvh] pt-20 bg-background flex flex-col">
      <div className="flex-1 w-full flex flex-col lg:flex-row h-full">
        {/* Control Panel */}
        <div className="w-full lg:w-72 bg-background border-r border-white/5 flex flex-col p-6 space-y-8 overflow-y-auto custom-scrollbar">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
              <Radar className="size-5 text-primary" /> ATC Core
            </h1>
            <p className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground text-primary/70">Secure Terminal</p>
          </div>

          <div className="space-y-4">
            <h2 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground border-b border-white/5 pb-2">Operator</h2>
            <div className="space-y-1">
              <p className="font-mono text-xs text-white uppercase">{user?.username}</p>
              <p className="font-mono text-[10px] text-primary">{user?.role}</p>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground border-b border-white/5 pb-2">Subsystems</h2>
            <nav className="flex flex-col gap-1">
              <Button variant="ghost" className="justify-start gap-3 h-9 px-2 text-xs font-mono uppercase tracking-wider bg-white/5 text-white hover:bg-white/10"><Radio className="size-3 text-primary" /> Active Terminal</Button>
              <Button variant="ghost" className="justify-start gap-3 h-9 px-2 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:bg-white/5" onClick={fetchData}><Database className="size-3" /> Refresh Data</Button>
            </nav>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="flex-1 bg-black p-6 flex flex-col relative overflow-hidden">
          {/* Subtle grid background to simulate radar screen environment */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

          <div className="relative z-10 flex-1 grid grid-cols-1 xl:grid-cols-3 gap-6">
            
            {/* Main Sector Info */}
            <div className="xl:col-span-2 flex flex-col gap-6">
              <div className="glass-panel border-primary/20 rounded p-6 flex items-center justify-between">
                <div>
                  <h3 className="text-[10px] uppercase tracking-widest font-bold text-primary mb-1">Sector Alpha Status</h3>
                  <p className="font-mono text-2xl text-white">{error ? "ERROR" : anomalies.length > 0 ? "DEGRADED" : "NOMINAL"}</p>
                </div>
                <div className="text-right">
                  <h3 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1">Active Targets</h3>
                  <p className="font-mono text-2xl text-white">{telemetry.length}</p>
                </div>
              </div>

              {/* Data Table */}
              <div className="glass-panel rounded flex-1 overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-white/5 bg-white/5 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest font-mono text-white">Live Telemetry Feed</span>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                  {loading && <div className="p-4 text-center text-xs font-mono text-muted-foreground">Loading telemetry...</div>}
                  {!loading && telemetry.length === 0 && <div className="p-4 text-center text-xs font-mono text-muted-foreground">No active targets in sector.</div>}
                  {telemetry.map(t => (
                    <div key={t.id} className="grid grid-cols-[80px_1fr_1fr_100px] gap-4 px-3 py-2 text-xs font-mono items-center hover:bg-white/5 rounded border border-transparent cursor-default transition-colors">
                      <span className="text-white">{t.flightNumber}</span>
                      <span className="text-muted-foreground">FL{Math.round((t.altitude ?? 0) / 100)}</span>
                      <span className="text-muted-foreground">{t.speed ?? 0} KT</span>
                      <span className="text-right text-primary">TRK-ON</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar / Anomalies */}
            <div className="flex flex-col gap-6">
              <div className={`glass-panel rounded flex-1 flex flex-col overflow-hidden ${anomalies.length > 0 ? 'border-destructive/30' : 'border-primary/20'}`}>
                <div className={`px-4 py-3 border-b flex items-center justify-between ${anomalies.length > 0 ? 'border-destructive/20 bg-destructive/10' : 'border-primary/20 bg-primary/10'}`}>
                  <div className="flex items-center gap-2">
                    {anomalies.length > 0 ? <ShieldAlert className="size-3 text-destructive" /> : <CheckCircle2 className="size-3 text-primary" />}
                    <span className={`text-[10px] uppercase tracking-widest font-mono font-bold ${anomalies.length > 0 ? 'text-destructive' : 'text-primary'}`}>Anomalies</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold">{anomalies.length} OPEN</span>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                  {loading && <div className="text-center text-xs font-mono text-muted-foreground py-4">Scanning...</div>}
                  {!loading && anomalies.length === 0 && (
                    <div className="flex flex-col items-center justify-center text-center opacity-50 py-12 space-y-2">
                      <AlertTriangle className="size-8 text-primary mb-2" />
                      <p className="font-mono text-xs uppercase tracking-widest text-primary">System Nominal</p>
                      <p className="text-[10px] text-muted-foreground">All operational telemetry within expected boundaries.</p>
                    </div>
                  )}
                  {anomalies.map(a => (
                    <div key={a.id} className="glass-panel p-3 rounded border border-destructive/20 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-mono text-sm text-destructive">{a.flightNumber}</p>
                          <p className="text-[10px] uppercase font-bold tracking-widest text-destructive/70">{a.anomalyType}</p>
                        </div>
                        <div className="px-1.5 py-0.5 rounded bg-destructive/20 text-[9px] font-mono font-bold text-destructive">
                          {a.severity}
                        </div>
                      </div>
                      
                      <p className="text-[11px] text-muted-foreground">{a.description}</p>
                      
                      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                        <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px] uppercase tracking-widest gap-1 border-white/10 hover:bg-white/10" onClick={() => handleStatusUpdate(a.id, "RESOLVED")}>
                          Resolve
                        </Button>
                        <Button size="sm" variant="secondary" className="flex-1 h-7 text-[10px] uppercase tracking-widest gap-1 bg-primary/20 text-primary hover:bg-primary/30" onClick={() => handleExplain(a.id)}>
                          <Sparkles className="size-3" /> AI Analysis
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* AI Explanation Modal */}
      <Dialog open={showExplanation} onOpenChange={setShowExplanation}>
        <DialogContent className="glass-panel-heavy border border-white/10 max-w-xl p-0 overflow-hidden bg-background">
          <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3 bg-primary/5">
            <Bot className="size-5 text-primary" />
            <DialogTitle className="text-sm font-semibold tracking-wide text-white uppercase">Intelligence Analysis</DialogTitle>
          </div>
          
          <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar space-y-6">
            {explainingId && (
              <div className="flex flex-col items-center justify-center py-12 space-y-4 opacity-50">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-[10px] font-mono tracking-widest uppercase text-primary">Synthesizing telemetry data...</p>
              </div>
            )}
            
            {explanation && !explainingId && (
              <div className="space-y-6">
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">Executive Summary</p>
                  <p className="text-sm text-white/90 leading-relaxed bg-white/5 p-4 rounded-lg border border-white/5">{explanation.explanation}</p>
                </div>
                
                {explanation.facts.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2 flex items-center gap-2"><div className="size-1.5 rounded-full bg-primary"/> Measured Facts</p>
                    <ul className="space-y-2">
                      {explanation.facts.map((f, i) => <li key={i} className="text-xs text-muted-foreground glass-panel px-3 py-2 rounded font-mono">{f}</li>)}
                    </ul>
                  </div>
                )}
                
                {explanation.context.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2 flex items-center gap-2"><div className="size-1.5 rounded-full bg-amber-500"/> Contextual Variables</p>
                    <ul className="space-y-2">
                      {explanation.context.map((c, i) => <li key={i} className="text-xs text-muted-foreground glass-panel px-3 py-2 rounded">{c}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
