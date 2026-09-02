import { createBrowserRouter } from "react-router-dom";
import { lazy, Suspense } from "react";
import { RootLayout } from "@/layouts/RootLayout";
import { NotFound } from "@/pages/NotFound";
import { Placeholder } from "@/pages/Placeholder";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import { Skeleton } from "@/components/ui/skeleton";

const TrackingPage = lazy(() => import("@/pages/TrackingPage").then((m) => ({ default: m.TrackingPage })));
const BookingPage = lazy(() => import("@/pages/BookingPage").then((m) => ({ default: m.BookingPage })));
const AirportsPage = lazy(() => import("@/pages/AirportsPage").then((m) => ({ default: m.AirportsPage })));
const AirportDetailPage = lazy(() => import("@/pages/AirportDetailPage").then((m) => ({ default: m.AirportDetailPage })));
const AircraftPage = lazy(() => import("@/pages/AircraftPage").then((m) => ({ default: m.AircraftPage })));
const AtcPage = lazy(() => import("@/pages/AtcPage").then((m) => ({ default: m.AtcPage })));
const ProfilePage = lazy(() => import("@/pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));

function LazyFallback() {
  return (
    <div className="space-y-3 py-8">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function withSuspense(node: React.ReactNode) {
  return <Suspense fallback={<LazyFallback />}>{node}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "tracking", element: withSuspense(<TrackingPage />) },
      {
        path: "booking",
        element: withSuspense(
          <ProtectedRoute redirectTo="/login">
            <BookingPage />
          </ProtectedRoute>
        ),
      },
      { path: "airports", element: withSuspense(<AirportsPage />) },
      { path: "airports/:iata", element: withSuspense(<AirportDetailPage />) },
      { path: "aircraft", element: withSuspense(<AircraftPage />) },
      { path: "ai", element: <Placeholder title="AI Assistant" route="/ai" description="AI search, recommendations, and ATC explanations are future functionality. Navigation placeholder only — no AI implementation in Part 3." /> },
      {
        path: "atc",
        element: withSuspense(
          <ProtectedRoute roles={["ATC_EMPLOYEE"]} redirectTo="/login">
            <AtcPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "profile",
        element: withSuspense(
          <ProtectedRoute redirectTo="/login">
            <ProfilePage />
          </ProtectedRoute>
        ),
      },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
