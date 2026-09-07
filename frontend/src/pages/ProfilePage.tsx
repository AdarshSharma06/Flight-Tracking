import { useAuth } from "@/hooks/useAuth";
import { User, ShieldCheck } from "lucide-react";

export function ProfilePage() {
  const { user, hasRole } = useAuth();
  const isAtc = hasRole("ATC_EMPLOYEE");

  return (
    <div className="w-full min-h-[100dvh] pt-28 pb-24 bg-background">
      <div className="max-w-3xl mx-auto px-6 space-y-8">
        
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Operator Profile</h1>
          <p className="text-xs uppercase tracking-widest font-mono text-muted-foreground">Identity & Clearance</p>
        </div>

        <div className="glass-panel-heavy rounded-xl p-8 shadow-2xl flex flex-col md:flex-row items-start gap-8">
          <div className="size-24 rounded-2xl bg-white/5 flex items-center justify-center shrink-0 border border-white/10">
            <User className="size-10 text-muted-foreground" />
          </div>

          <div className="flex-1 space-y-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Username</p>
              <p className="text-2xl font-mono text-white font-semibold">{user?.username || "—"}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-white/5">
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><ShieldCheck className="size-3" /> Clearance Level</p>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-[10px] uppercase tracking-widest font-mono font-bold
                    ${isAtc ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted/50 text-muted-foreground border border-white/10'}`}>
                    {user?.role || "GUEST"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
