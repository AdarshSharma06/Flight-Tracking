import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { bookingService } from "@/services/booking.service";
import { ApiError } from "@/services/api";
import type { BookingResponse, PageResponse } from "@/types/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { User, ShieldCheck, LogOut, Ticket, Calendar, AlertCircle, Clock } from "lucide-react";

function formatExpiry(exp: number | undefined): string {
  if (!exp) return "—";
  try {
    return new Date(exp * 1000).toLocaleString();
  } catch {
    return String(exp);
  }
}

export function ProfilePage() {
  const { user, token, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<BookingResponse[] | null>(null);
  const [pageInfo, setPageInfo] = useState<PageResponse<BookingResponse> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // decode exp from token
  const exp = (() => {
    if (!token) return undefined;
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload.exp as number | undefined;
    } catch {
      return undefined;
    }
  })();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await bookingService.listMyBookingsPaginated(0, 5);
      setBookings(res.content);
      setPageInfo(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setError("Session expired. Please login again.");
      else if (e instanceof ApiError) setError(e.message);
      else setError("Failed to load bookings.");
      // fallback to non-paginated
      try {
        const list = await bookingService.listMyBookings();
        setBookings(list);
        setPageInfo(null);
        setError(null);
      } catch {
        // keep original error if fallback also fails
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  if (!isAuthenticated || !user) {
    return (
      <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Not authenticated</AlertTitle><AlertDescription>Please <Link to="/login" className="underline">login</Link>.</AlertDescription></Alert>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><User className="size-6 text-primary" /> Profile</h1>
          <p className="text-sm text-muted-foreground">Authenticated via JWT. No profile-update API — display only.</p>
        </div>
        <Button variant="outline" onClick={handleLogout} className="gap-2"><LogOut className="size-4" /> Logout</Button>
      </div>

      <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /> Account</CardTitle>
            <CardDescription>From <code className="bg-muted px-1 rounded">AuthContext</code> JWT claims (<code className="bg-muted px-1 rounded">sub/role/exp</code>).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Username</span><span className="font-mono font-medium">{user.username}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Role</span><Badge variant={user.role === "ATC_EMPLOYEE" ? "default" : "secondary"}>{user.role}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">User ID</span><span className="font-mono">{user.id || "— (not in JWT)"}</span></div>
            <Separator />
            <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Clock className="size-3" /> Session expiry</span><span className="font-mono text-xs">{formatExpiry(exp)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Session</span><Badge variant="secondary" className="text-[11px]">Active</Badge></div>
            <Alert>
              <AlertCircle className="size-4" />
              <AlertTitle className="text-xs">No editing</AlertTitle>
              <AlertDescription className="text-xs">Backend has no <code className="bg-background px-1 rounded border">PUT /api/user</code> — no email, avatar, or password change UI is intentionally omitted.</AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Ticket className="size-5" /> Booking summary</CardTitle>
            <CardDescription>Via <code className="bg-muted px-1 rounded">GET /api/bookings?page&size</code></CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <Skeleton className="h-20 w-full" />}
            {error && <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Bookings error</AlertTitle><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
            {!loading && !error && bookings && bookings.length === 0 && (
              <Alert><Calendar className="size-4" /><AlertTitle>No bookings</AlertTitle><AlertDescription className="text-xs">You have no bookings yet. <Link to="/booking" className="text-primary underline">Search flights</Link> to create one.</AlertDescription></Alert>
            )}
            {bookings && bookings.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs"><Badge variant="secondary">{pageInfo ? pageInfo.totalElements : bookings.length} total</Badge><span className="text-muted-foreground">{pageInfo ? `page 1 of ${pageInfo.totalPages}` : ""}</span></div>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-xs">Flight</TableHead><TableHead className="text-xs">Route</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {bookings.slice(0, 5).map((b) => (
                        <TableRow key={b.id}><TableCell className="font-mono text-xs">{b.flightNumber}</TableCell><TableCell className="text-xs">{b.origin}→{b.destination} <span className="text-muted-foreground">({b.status})</span></TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Link to="/booking" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}>Go to bookings</Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Session & security</CardTitle><CardDescription className="text-xs">JWT stored as <code className="bg-muted px-1 rounded">flight_tracking_token</code> in localStorage. Attached as <code className="bg-muted px-1 rounded">Authorization: Bearer</code>. Backend is authoritative — frontend role hiding is UI only.</CardDescription></CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <div>• Guest: Home, public UI; protected APIs 401.</div>
          <div>• USER: tracking, booking, airports, aircraft, profile.</div>
          <div>• ATC_EMPLOYEE: + ATC dashboard (<code className="bg-muted px-1 rounded">/api/atc/**</code> 403 otherwise).</div>
          <div>• Token expiry triggers auto-clear in <code className="bg-muted px-1 rounded">AuthContext</code>.</div>
        </CardContent>
      </Card>
    </div>
  );
}
