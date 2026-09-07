import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Menu, Plane, LogOut, User, ShieldCheck } from "lucide-react";
import { useState } from "react";

type NavItem = { to: string; label: string; requiresAuth?: boolean; guestOnly?: boolean; roles?: Array<"USER" | "ATC_EMPLOYEE" | "ADMIN"> };

const commonItems: NavItem[] = [
  { to: "/tracking", label: "Tracking" },
  { to: "/airports", label: "Airports" },
  { to: "/aircraft", label: "Aircraft" },
];

export function RootLayout() {
  const { isAuthenticated, user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const isAtc = hasRole("ATC_EMPLOYEE");

  const navItems: NavItem[] = (() => {
    if (!isAuthenticated) return commonItems;
    if (isAtc) {
      return [...commonItems.slice(0, 1), { to: "/booking", label: "Booking" }, ...commonItems.slice(1), { to: "/ai", label: "Assistant" }, { to: "/atc", label: "ATC" }];
    }
    return [...commonItems.slice(0, 1), { to: "/booking", label: "Booking" }, ...commonItems.slice(1), { to: "/ai", label: "Assistant" }];
  })();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const closeSheet = () => setOpen(false);

  // Check if we are on a cinematic page where we want the nav to be fully transparent at the top
  const isCinematicPage = location.pathname === "/" || location.pathname === "/login" || location.pathname === "/register" || location.pathname.startsWith("/airports/");

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col relative">
      <header className={cn(
        "fixed top-0 z-50 w-full transition-all duration-300",
        isCinematicPage ? "bg-gradient-to-b from-background/90 to-transparent border-b-0" : "bg-background/70 backdrop-blur-md border-b border-white/5"
      )}>
        <div className="w-full px-6 lg:px-12 h-20 grid grid-cols-2 lg:grid-cols-3 items-center gap-6">
          {/* Brand – LEFT */}
          <Link to="/" className="flex items-center gap-3 font-semibold tracking-tight shrink-0 group justify-self-start">
            <span className="inline-flex size-8 items-center justify-center rounded bg-primary text-primary-foreground group-hover:bg-primary/90 transition-colors">
              <Plane className="size-4" />
            </span>
            <span className="text-lg tracking-wide uppercase font-mono">Flight Tracking</span>
          </Link>

          {/* Desktop nav – CENTER */}
          <nav className="hidden lg:flex items-center justify-center gap-6 lg:gap-7 xl:gap-8 justify-self-center">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "text-[11px] uppercase tracking-[0.1em] font-semibold transition-all",
                    isActive ? "text-primary drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]" : "text-muted-foreground hover:text-foreground"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Desktop auth actions – RIGHT */}
          <div className="hidden lg:flex items-center justify-end gap-4 justify-self-end">
            {!isAuthenticated ? (
              <>
                <Link to="/login" className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground transition-colors">
                  Login
                </Link>
                <Link to="/register" className={cn(buttonVariants({ variant: "default", size: "sm" }), "h-8 px-4 text-[11px] uppercase tracking-wider font-semibold")}>
                  Sign Up
                </Link>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <Link
                  to="/profile"
                  className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  <User className="size-3.5" />
                  <span className="max-w-[120px] truncate">{user?.username}</span>
                  {isAtc && <ShieldCheck className="size-3.5 text-primary" />}
                </Link>
                <button onClick={handleLogout} className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
                  <LogOut className="size-3.5" />
                  Logout
                </button>
              </div>
            )}
          </div>

          {/* Mobile trigger – right aligned */}
          <div className="justify-self-end lg:hidden flex justify-end">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger>
                <Button variant="ghost" size="icon" className="text-foreground hover:bg-white/10 rounded-full">
                  <Menu className="size-5" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
            <SheetContent side="right" className="w-full sm:w-[360px] glass-panel-heavy border-l border-white/10 p-0">
              <SheetHeader className="text-left p-6 border-b border-white/5">
                <SheetTitle className="flex items-center gap-3 font-mono uppercase tracking-widest text-sm">
                  <Plane className="size-4 text-primary" />
                  Operations
                </SheetTitle>
              </SheetHeader>
              <div className="p-6 flex flex-col gap-6 h-[calc(100vh-80px)] overflow-y-auto">
                <nav className="flex flex-col gap-4">
                  <Link to="/" onClick={closeSheet} className="text-sm uppercase tracking-widest font-semibold hover:text-primary transition-colors">Home</Link>
                  {navItems.map((item) => (
                    <Link key={item.to} to={item.to} onClick={closeSheet} className="text-sm uppercase tracking-widest font-semibold hover:text-primary transition-colors">
                      {item.label}
                    </Link>
                  ))}
                  {isAuthenticated && (
                    <Link to="/profile" onClick={closeSheet} className="text-sm uppercase tracking-widest font-semibold hover:text-primary transition-colors">Profile</Link>
                  )}
                </nav>
                <div className="mt-auto flex flex-col gap-4 pt-6 border-t border-white/5">
                  {!isAuthenticated ? (
                    <>
                      <Link to="/login" onClick={closeSheet} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full rounded-md uppercase tracking-wider text-xs h-12")}>Login</Link>
                      <Link to="/register" onClick={closeSheet} className={cn(buttonVariants({ variant: "default", size: "lg" }), "w-full rounded-md uppercase tracking-wider text-xs h-12")}>Sign Up</Link>
                    </>
                  ) : (
                    <Button variant="outline" onClick={() => { closeSheet(); handleLogout(); }} className="gap-2 w-full h-12 rounded-md uppercase tracking-wider text-xs">
                      <LogOut className="size-4" /> Logout
                    </Button>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>

      {!isCinematicPage && (
        <footer className="border-t border-white/5 bg-background/50 backdrop-blur-sm mt-auto">
          <div className="w-full px-6 lg:px-12 py-12">
            <div className="grid gap-12 md:grid-cols-3">
              <div className="space-y-4">
                <Link to="/" className="flex items-center gap-3 font-mono uppercase tracking-widest">
                  <Plane className="size-4 text-primary" />
                  <span>Flight Tracking</span>
                </Link>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-[40ch]">
                  Premium aviation intelligence and tracking platform.
                </p>
              </div>
              <div className="space-y-4">
                <h4 className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Platform</h4>
                <ul className="space-y-2 text-xs">
                  <li><Link to="/tracking" className="hover:text-foreground transition-colors">Live Tracking</Link></li>
                  <li><Link to="/airports" className="hover:text-foreground transition-colors">Airports</Link></li>
                  <li><Link to="/aircraft" className="hover:text-foreground transition-colors">Aircraft</Link></li>
                  <li><Link to="/booking" className="hover:text-foreground transition-colors">Booking</Link></li>
                </ul>
              </div>
              <div className="space-y-4">
                <h4 className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Resources</h4>
                <ul className="space-y-2 text-xs">
                  <li><Link to="/ai" className="hover:text-foreground transition-colors">AI Assistant</Link></li>
                  <li><Link to="/profile" className="hover:text-foreground transition-colors">Profile</Link></li>
                </ul>
              </div>
            </div>
            <div className="mt-12 pt-6 border-t border-white/5 flex flex-col sm:flex-row justify-between gap-4 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>© {new Date().getFullYear()} Flight Tracking.</span>
              <span>Aviation Data System</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
