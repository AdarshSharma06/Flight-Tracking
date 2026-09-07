import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { authService } from "@/services/auth.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plane, Loader2 } from "lucide-react";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await authService.login({ username, password });
      login(res.token);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || "Failed to login");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full h-[100dvh] flex items-center justify-center relative bg-background overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img src="/images/login_bg.jpg" alt="Atmospheric Space" className="w-full h-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-background/10" />
      </div>

      <div className="relative z-10 w-full max-w-md p-8 glass-panel-heavy rounded-xl shadow-2xl flex flex-col items-center">
        <div className="size-12 rounded-lg bg-white/5 flex items-center justify-center mb-6">
          <Plane className="size-6 text-primary" />
        </div>
        
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Sign In</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Secure Operations Access</p>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div className="space-y-4">
            <Input
              id="username"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="bg-background/50 border-white/10 h-12 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-primary focus-visible:border-primary transition-all"
            />
            <Input
              id="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-background/50 border-white/10 h-12 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-primary focus-visible:border-primary transition-all"
            />
          </div>

          {error && <p className="text-destructive text-xs font-mono text-center bg-destructive/10 py-2 rounded">{error}</p>}

          <Button type="submit" disabled={isLoading} className="w-full h-12 font-semibold uppercase tracking-widest text-xs mt-4">
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : "Sign In"}
          </Button>
        </form>

        <div className="mt-8 text-center text-xs text-muted-foreground">
          New personnel?{" "}
          <Link to="/register" className="text-primary hover:text-primary/80 transition-colors uppercase tracking-wider font-semibold">
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
