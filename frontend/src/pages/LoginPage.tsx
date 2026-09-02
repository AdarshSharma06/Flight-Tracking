import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plane, Eye, EyeOff, Info, Loader2 } from "lucide-react";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: string })?.from ?? "/";

  const validate = (): string | null => {
    if (!username.trim()) return "Username is required.";
    if (!password) return "Password is required.";
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await authService.login({ username: username.trim(), password });
      login(res.token);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        // Prefer backend message
        const body = err.body as { message?: string; details?: string[] } | null;
        const details = body?.details?.join(" ") ?? "";
        setError(err.message + (details ? ` — ${details}` : ""));
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6 py-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Plane className="size-5" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to access tracking, bookings, and ATC features.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Login</CardTitle>
          <CardDescription>Fields match backend <code className="bg-muted px-1 rounded text-xs">LoginRequest</code>: username + password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                placeholder="your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <Info className="size-4" />
                <AlertTitle>Login failed</AlertTitle>
                <AlertDescription className="text-xs leading-relaxed">{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full gap-2" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? "Signing in…" : "Sign in"}
            </Button>

            <p className="text-sm text-center text-muted-foreground">
              Don’t have an account?{" "}
              <Link to="/register" className="text-primary underline-offset-4 hover:underline">
                Sign up
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-center text-muted-foreground">
        Backend: <code className="bg-muted px-1 rounded">POST /api/auth/login</code> → <code className="bg-muted px-1 rounded">{"{ token }"}</code> • JWT stored as <code className="bg-muted px-1 rounded">flight_tracking_token</code>
      </p>
    </div>
  );
}
