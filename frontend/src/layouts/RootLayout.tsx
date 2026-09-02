import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Menu, Plane, LogOut, User, ShieldCheck } from "lucide-react";
import { useState } from "react";

type NavItem = { to: string; label: string; requiresAuth?: boolean; guestOnly?: boolean; roles?: Array<"USER" | "ATC_EMPLOYEE" | "ADMIN"> };

const commonItems: NavItem[] = [
  { to: "/tracking", label: "Track" },
  { to: "/airports", label: "Airports" },
  { to: "/aircraft", label: "Aircraft" },
];

export function RootLayout() {
  const { isAuthenticated, user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const isAtc = hasRole("ATC_EMPLOYEE");

  // Build nav based on auth state
  const navItems: NavItem[] = (() => {
    if (!isAuthenticated) {
      return [...commonItems, { to: "/#about", label: "About" }];
    }
    if (isAtc) {
      return [...commonItems.slice(0, 1), { to: "/booking", label: "Book" }, ...commonItems.slice(1), { to: "/ai", label: "AI" }, { to: "/atc", label: "ATC" }];
    }
    return [...commonItems.slice(0, 1), { to: "/booking", label: "Book" }, ...commonItems.slice(1), { to: "/ai", label: "AI" }];
  })();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const closeSheet = () => setOpen(false);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between gap-4">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight shrink-0">
            <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Plane className="size-5" />
            </span>
            <span className="text-[1.05rem]">Flight Tracking</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Desktop auth actions */}
          <div className="hidden lg:flex items-center gap-2">
            {!isAuthenticated ? (
              <>
                <Link to="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                  Login
                </Link>
                <Link to="/register" className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
                  Sign Up
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/profile"
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2")}
                >
                  <User className="size-4" />
                  <span className="max-w-[120px] truncate">{user?.username}</span>
                  {isAtc && <ShieldCheck className="size-3.5 text-primary" />}
                </Link>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5">
                  <LogOut className="size-4" />
                  Logout
                </Button>
              </>
            )}
          </div>

          {/* Mobile trigger */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="size-5" />
                  <span className="sr-only">Open menu</span>
                </Button>
              }
            />
            <SheetContent side="right" className="w-[320px] sm:w-[360px]">
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2">
                  <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <Plane className="size-4" />
                  </span>
                  Flight Tracking
                </SheetTitle>
              </SheetHeader>
              <div className="px-4 flex flex-col gap-4 flex-1 overflow-y-auto">
                <nav className="flex flex-col gap-1">
                  <Link to="/" onClick={closeSheet} className="px-3 py-2 rounded-md text-sm font-medium hover:bg-muted">
                    Home
                  </Link>
                  {navItems.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={closeSheet}
                      className="px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      {item.label}
                    </Link>
                  ))}
                  {isAuthenticated && (
                    <Link
                      to="/profile"
                      onClick={closeSheet}
                      className="px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      Profile
                    </Link>
                  )}
                </nav>
                <Separator />
                <div className="flex flex-col gap-2">
                  {!isAuthenticated ? (
                    <>
                      <Link
                        to="/login"
                        onClick={closeSheet}
                        className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
                      >
                        Login
                      </Link>
                      <Link
                        to="/register"
                        onClick={closeSheet}
                        className={cn(buttonVariants({ variant: "default", size: "lg" }), "w-full")}
                      >
                        Sign Up
                      </Link>
                    </>
                  ) : (
                    <>
                      <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-3">
                        <span className="size-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="size-4" />
                        </span>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium leading-none">{user?.username}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            {user?.role}
                            {isAtc && <ShieldCheck className="size-3 text-primary" />}
                          </span>
                        </div>
                      </div>
                      <Button variant="outline" onClick={() => { closeSheet(); handleLogout(); }} className="gap-2">
                        <LogOut className="size-4" /> Logout
                      </Button>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Professional flight tracking. Aviation data powered by backend REST APIs. AI features coming soon as placeholder.
                </p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Outlet />
        </div>
      </main>

      <footer className="border-t bg-muted/20">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="space-y-2">
              <Link to="/" className="flex items-center gap-2 font-semibold">
                <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Plane className="size-4" />
                </span>
                Flight Tracking
              </Link>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Modern aviation platform for flight tracking, airport intelligence, and booking — built on Spring Boot + React.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Platform</h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li><Link to="/tracking" className="hover:text-foreground">Flight Tracking</Link></li>
                <li><Link to="/airports" className="hover:text-foreground">Airports</Link></li>
                <li><Link to="/aircraft" className="hover:text-foreground">Aircraft</Link></li>
                <li><Link to="/booking" className="hover:text-foreground">Booking</Link></li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Resources</h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li><Link to="/ai" className="hover:text-foreground">AI Assistant (soon)</Link></li>
                <li><Link to="/profile" className="hover:text-foreground">Profile</Link></li>
                <li><span className="text-xs">Backend: Spring Boot • PostgreSQL • JWT • AviationStack • Open-Meteo</span></li>
              </ul>
            </div>
          </div>
          <Separator className="my-6" />
          <div className="flex flex-col sm:flex-row justify-between gap-2 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} Flight Tracking. All rights reserved.</span>
            <span>TweakCN theme • shadcn/ui • Lucide • Tailwind v4</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
