import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plane, Eye, EyeOff, Info, Loader2, CheckCircle2 } from "lucide-react";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/services/api";

export function RegisterPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validate = (): string | null => {
    const u = username.trim();
    if (!u) return "Username is required.";
    if (u.length < 3 || u.length > 50) return "Username must be between 3 and 50 characters.";
    if (!password) return "Password is required.";
    if (password.length < 6 || password.length > 100) return "Password must be between 6 and 100 characters.";
    if (password !== confirm) return "Passwords do not match.";
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      setSuccess(null);
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await authService.register({ username: username.trim(), password });
      setSuccess(res.message ?? `Account created for ${res.username}. Please sign in.`);
      // Brief delay then redirect to login
      setTimeout(() => navigate("/login"), 900);
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string; details?: string[] } | null;
        const details = body?.details?.join(" ") ?? "";
        setError(err.message + (details ? ` — ${details}` : ""));
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Registration failed. Please try again.");
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
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="text-sm text-muted-foreground">Normal registration is <code className="bg-muted px-1 rounded text-xs">USER</code> only. No role selector — backend enforces it.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sign Up</CardTitle>
          <CardDescription>
            Matches backend <code className="bg-muted px-1 rounded text-xs">RegisterRequest</code>: username (3–50) + password (6–100). Role is server-assigned.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="r-username">Username</Label>
              <Input
                id="r-username"
                autoComplete="username"
                placeholder="choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-password">Password</Label>
              <div className="relative">
                <Input
                  id="r-password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="at least 6 characters"
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
            <div className="space-y-2">
              <Label htmlFor="r-confirm">Confirm password</Label>
              <Input
                id="r-confirm"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                placeholder="repeat password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <Info className="size-4" />
                <AlertTitle>Registration failed</AlertTitle>
                <AlertDescription className="text-xs leading-relaxed">{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert>
                <CheckCircle2 className="size-4" />
                <AlertTitle>Success</AlertTitle>
                <AlertDescription className="text-xs leading-relaxed">{success} Redirecting to login…</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full gap-2" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? "Creating…" : "Create account"}
            </Button>

            <p className="text-sm text-center text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-primary underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-center text-muted-foreground">
        Backend: <code className="bg-muted px-1 rounded">POST /api/auth/register</code> → 201 <code className="bg-muted px-1 rounded">{"{ id, username, role, message }"}</code> • No <code className="bg-muted px-1 rounded">ATC_EMPLOYEE</code> or <code className="bg-muted px-1 rounded">ADMIN</code> selection in UI.
      </p>
    </div>
  );
}
