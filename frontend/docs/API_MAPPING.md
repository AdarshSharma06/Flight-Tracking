# Frontend ↔ Backend API Mapping — Flight Tracking (Part 3)

> Part 1 foundation; Part 2 Tracking/Booking/Airports/Aircraft; Part 3 adds ATC Dashboard + Profile + complete weather integration + full backend verification.

This document maps the **actual** Spring Boot backend contracts (verified from `backend/src/main/java/com/flighttracking`) to the React frontend (`frontend/src`). Do not invent endpoints — only those below exist.

Base URL configured via env:
- `VITE_API_BASE_URL` (see `frontend/.env` and `frontend/src/services/api.ts:32`). Defaults to `http://localhost:8080`. Production should set this to the deployed Spring Boot URL. CORS allows `http://localhost:5173` and `http://localhost:3000` (`backend/src/main/java/com/flighttracking/config/CorsConfig.java:15`).

---

## Authentication & Authorization

| Frontend feature | Method | Backend endpoint | Request | Response | Auth | Role | Frontend status |
|---|---|---|---|---|---|---|---|
| Register (Sign Up) | POST | `/api/auth/register` | `RegisterRequest { username: string (3–50, @NotBlank), password: string (6–100, @NotBlank) }` | `RegisterResponse { id, username, role, message }` 201 | No | — | **Integrated** via `auth.service.ts:8` → `RegisterPage.tsx` |
| Login (Sign In) | POST | `/api/auth/login` | `LoginRequest { username (@NotBlank), password (@NotBlank) }` | `AuthResponse { token: string }` 200 | No | — | **Integrated** via `auth.service.ts:5` → `LoginPage.tsx` |
| Test auth | GET | `/api/test/user` | — | `MessageResponse { message }` 200 | Yes (any authenticated) | — | Backend available — frontend integration pending |

**JWT handling (frontend `src/services/api.ts` + `src/context/AuthContext.tsx`):**
- Token stored in `localStorage` under `flight_tracking_token` (`TOKEN_KEY`). Helpers `getToken()` / `setToken()` + `Api` wrapper attaches `Authorization: Bearer <token>` when `auth !== false`.
- `AuthContext` parses JWT (`sub` = username, `role` claim, `exp`/`iat`) via `atob`, exposes `user`, `token`, `isAuthenticated`, `role`, `hasRole()`, `login(token)`, `logout()`. Expired tokens are cleared.
- `ProtectedRoute.tsx` uses `isAuthenticated` and `hasRole(roles)` to guard `/booking`, `/profile`, `/atc`. Redirects to `/login`. **Frontend visibility ≠ authorization** — backend `SecurityConfig.java:40` is authoritative (`/api/atc/**` requires `hasRole("ATC_EMPLOYEE")`, `anyRequest().authenticated()`).

**Roles (backend `entity/Role.java`):** `USER` (default on register), `ATC_EMPLOYEE`, `ADMIN`. Frontend must NOT show role picker — `RegisterPage.tsx` enforces this.

**Error shape:** `ApiErrorResponse { timestamp, status, error, message, path, details[]? }` (`dto/ApiErrorResponse.java`). `GlobalExceptionHandler.java` maps validation (400), duplicate username (409), BadCredentials (401), external API failures etc. Frontend `apiFetch` throws `ApiError(status, message, body)` and UI shows `message` + optional `details`.

---

## Health

| Feature | Method | Endpoint | Request | Response | Auth | Role | Status |
|---|---|---|---|---|---|---|---|
| Health check | GET | `/api/health` | — | `HealthResponse { status, application, timestamp }` 200 | No | — | Backend available — frontend `auth.service.ts:11` has `health()` helper, not yet rendered on UI |

---

## Flights (AviationStack proxy) — **IMPLEMENTED**

| Feature | Method | Endpoint | Request params | Response | Auth | Role | Frontend status |
|---|---|---|---|---|---|---|---|
| Search flights | GET | `/api/flights/search` | `flight_iata?`, `dep_iata?` (^[A-Za-z]{3}$), `arr_iata?` (same), `airline_iata?`, `flight_status?`, `limit?` (1–100), `sortBy?`, `order?` | `FlightSearchResponse { flights: FlightDto[], count }` 200 | Yes | — | **Implemented** — `HomePage.tsx` + `TrackingPage.tsx` + `BookingPage.tsx` via `flight.service.ts:8` with `flight_iata/dep_iata/arr_iata/airline_iata/flight_status/limit` + URL sync `?flight_iata=` |
| Get flight by number | GET | `/api/flights/{flightNumber}` | path `flightNumber` | `FlightDto` 200 | Yes | — | **Implemented** — `TrackingPage.tsx` `flightService.getByFlightNumber()` on selection |
| Get flight tracking | GET | `/api/flights/{flightNumber}/tracking` | path `flightNumber` | `FlightTrackingDto` (includes live position/telemetry if available: latitude/longitude/altitude/speed/direction etc.) 200 | Yes | — | **Implemented** — `TrackingPage.tsx` `flightService.getTracking()`; honest empty state if `latitude/longitude == null` (AviationStack free tier often empty) |

`FlightDto` fields (`dto/flight/FlightDto.java`): `flightNumber`, `flightIata`, `flightIcao`, `airlineName/Iata/Icao`, `departureAirport/Iata/Icao/Terminal/Gate/Scheduled/Estimated/Actual/Delay`, same for `arrival*`, `status`, `aircraftRegistration/Iata/Icao`.
`FlightTrackingDto` adds `flightDate`, `route`, `latitude`, `longitude`, `altitude`, `speed`, `speedVertical`, `direction`, `isGround`, `liveUpdated`.

---

## Airports — **IMPLEMENTED**

| Feature | Method | Endpoint | Request | Response | Auth | Role | Status |
|---|---|---|---|---|---|---|---|
| Get airport by IATA | GET | `/api/airports/{iata}` | path `iata` (^[A-Za-z]{3}$) | `AirportDto { iata, icao, name, city, country, latitude, longitude, timezone, countryIso2 }` 200 | Yes | — | **Implemented** — `AirportsPage.tsx` IATA search + `AirportDetailPage.tsx` header + `airport.service.ts` |
| List departures | GET | `/api/airports/{iata}/departures` | path `iata`, query `limit?` (1–100) | `{ airport, type: "departures", count, flights: FlightDto[] }` 200 | Yes | — | **Implemented** — `AirportDetailPage.tsx` Tabs → Table via `airport.service.ts:getDepartures()` |
| List arrivals | GET | `/api/airports/{iata}/arrivals` | same as above | `{ airport, type: "arrivals", count, flights: FlightDto[] }` 200 | Yes | — | **Implemented** — same Tabs/Table via `airport.service.ts:getArrivals()` |

---

## Bookings — **IMPLEMENTED**

| Feature | Method | Endpoint | Request | Response | Auth | Role | Status |
|---|---|---|---|---|---|---|---|
| Create booking | POST | `/api/bookings` | `BookingRequest { flightNumber (req, ≤20), origin (req, ^[A-Za-z]{3}$), destination (req, ^[A-Za-z]{3}$), departureScheduled?, arrivalScheduled?, airlineName? (≤100), aircraftRegistration? (≤50) }` | `BookingResponse { id, userId, username, flightNumber, origin, destination, departureScheduled, arrivalScheduled, airlineName, aircraftRegistration, status, createdAt }` 201 | Yes | — | **Implemented** — `BookingPage.tsx` Dialog + validation matching constraints + `booking.service.ts:create()` |
| List my bookings | GET | `/api/bookings` | `page?`, `size?` — if either present, paginated response `PageResponse<BookingResponse>` else `List<BookingResponse>` | `PageResponse { content, page, size, totalElements, totalPages, first, last }` or `[]` 200 | Yes | — | **Implemented** — `BookingPage.tsx` history Table + `Pagination` via `booking.service.ts:listMyBookingsPaginated()` with fallback to `listMyBookings()` |
| Get booking by id | GET | `/api/bookings/{id}` | path `id` | `BookingResponse` 200 (404 if not owned) | Yes | — | **Implemented** — `BookingPage.tsx` View Dialog via `booking.service.ts:getById()` |

---

## ATC (role-gated) — **IMPLEMENTED**

Spring Security (`SecurityConfig.java:48`) requires `hasRole("ATC_EMPLOYEE")` for **all** `/api/atc/**`. Frontend shows `/atc` link only to ATC role (`RootLayout.tsx` + `ProtectedRoute roles=[ATC_EMPLOYEE]`), but backend remains authoritative. `AtcPage.tsx` handles 401 (login) + 403 (role) cleanly.

| Feature | Method | Endpoint | Request | Response | Auth | Role | Status |
|---|---|---|---|---|---|---|---|
| ATC test | GET | `/api/atc/test` | — | `MessageResponse` 200 | Yes | ATC_EMPLOYEE | Backend available — not surfaced (health) |
| Create telemetry | POST | `/api/atc/telemetry` | `TelemetryRequest { flightNumber (req, ≤20), flightIata?, flightIcao?, airlineIata?, originIata? (^[A-Za-z]{3}$), destinationIata?, latitude? (-90..90), longitude? (-180..180), altitude?, speed?, direction? (0..360), heading? (0..360), flightStatus? (≤30), routeInfo? (≤500), aircraftRegistration? (≤50) }` | `TelemetryResponse { id, flightNumber, flightIata, flightIcao, airlineIata, originIata, destinationIata, latitude, longitude, altitude, speed, direction, heading, flightStatus, routeInfo, aircraftRegistration, recordedAt, createdAt }` 201 | Yes | ATC_EMPLOYEE | Backend available — create not exposed in Part 3 (read+status only) |
| List telemetry | GET | `/api/atc/telemetry` | `flightNumber?`, `page?`, `size?` (paginated if page/size present) | `PageResponse<TelemetryResponse>` or `List<TelemetryResponse>` 200 | Yes | ATC_EMPLOYEE | **Implemented** — `AtcPage.tsx` table + pagination + map selection via `atc.service.ts:listTelemetry()` |
| Get telemetry by id | GET | `/api/atc/telemetry/{id}` | path `id` | `TelemetryResponse` 200 | Yes | ATC_EMPLOYEE | Backend available — not directly listed (detail via selection) |
| Create anomaly | POST | `/api/atc/anomalies` | `AnomalyRequest { flightNumber (req, ≤20), flightIata?, anomalyType (req, ^[A-Za-z0-9_\-]+$, ≤50), severity (req, LOW|MEDIUM|HIGH|CRITICAL), description? (≤1000), status? (OPEN|INVESTIGATING|RESOLVED|FALSE_POSITIVE), telemetryId? }` | `AnomalyResponse { id, flightNumber, flightIata, anomalyType, severity, description, status, telemetryId, detectedAt, resolvedAt, createdAt, updatedAt }` 201 | Yes | ATC_EMPLOYEE | Backend available — create not exposed (read+update) |
| List anomalies | GET | `/api/atc/anomalies` | `flightNumber?`, `page?`, `size?` | `PageResponse<AnomalyResponse>` or `List<AnomalyResponse>` 200 | Yes | ATC_EMPLOYEE | **Implemented** — `AtcPage.tsx` table via `atc.service.ts:listAnomalies()` |
| Get anomaly by id | GET | `/api/atc/anomalies/{id}` | path `id` | `AnomalyResponse` 200 | Yes | ATC_EMPLOYEE | Backend available — detail via table |
| Update anomaly status | PATCH | `/api/atc/anomalies/{id}/status` | `Map { status: string (required) }` → `OPEN|INVESTIGATING|RESOLVED|FALSE_POSITIVE` | `AnomalyResponse` 200 | Yes | ATC_EMPLOYEE | **Implemented** — `AtcPage.tsx` Select `handleStatusUpdate` → `PATCH { status }` + `atc.service.ts:updateAnomalyStatus()` + success feedback |

---

## Weather (Open-Meteo proxy) — **IMPLEMENTED**

| Feature | Method | Endpoint | Request | Response | Auth | Role | Status |
|---|---|---|---|---|---|---|---|
| Weather by coords | GET | `/api/weather` | `latitude` (-90..90, req), `longitude` (-180..180, req) | `WeatherDto { latitude, longitude, timezone, temperature, apparentTemperature?, humidity?, precipitation?, windSpeed?, weatherCode?, weatherCondition?, observationTime? }` 200 | Yes | — | **Implemented** — `TrackingPage.tsx` (live flight coords) + `AtcPage.tsx` (selected telemetry) via `weather.service.ts:getByCoordinates()` with loading/empty/error; `AirportDetailPage` also airport weather |
| Weather by airport | GET | `/api/weather/airport/{iata}` | path `iata` (^[A-Za-z]{3}$) | `WeatherDto` 200 | Yes | — | **Implemented** — `AirportDetailPage.tsx` weather card via `weather.service.ts:getByAirport()` |

---

## Pagination & Errors

- **Pagination:** `PageResponse<T>` (backend `dto/PageResponse.java`) serializes as `{ content, page, size, totalElements, totalPages, first, last }`. Frontend type `src/types/api.ts:2` mirrors this. Controllers (`BookingController.java:21`, `AtcController.java:40`) serve both list and paginated shapes depending on presence of `page`/`size`.
- **Validation errors:** `GlobalExceptionHandler` returns 400 with `details: ["field: message"]` from `MethodArgumentNotValidException` and `ConstraintViolationException`. Frontend `LoginPage` / `RegisterPage` surface these via `ApiError`.
- **401/403:** Handled by `SecurityConfig` exceptionHandling with `ApiErrorResponse` shape; `ApiError.status` distinguishes.

---

## Frontend Service Layer (Part 3)

- **Central client:** `src/services/api.ts` — `getApiBaseUrl()`, `getToken()/setToken()`, `apiFetch<T>()`, `Api` helpers (`get/post/put/patch/del`), `ApiError`. Never hardcode URLs. Handles 401/403 via `ApiError.status`.
- **Feature services:** `src/services/flight.service.ts` (`search`, `getByFlightNumber`, `getTracking`), `src/services/airport.service.ts` (`getByIata`, `getDepartures`, `getArrivals`), `src/services/booking.service.ts` (`create`, `listMyBookings`, `listMyBookingsPaginated`, `getById`), `src/services/weather.service.ts` (`getByCoordinates`, `getByAirport` — now used for tracking/ATC live coords), `src/services/atc.service.ts` (`listTelemetry`, `listTelemetryPaginated`, `getTelemetryById`, `listAnomalies`, `listAnomaliesPaginated`, `updateAnomalyStatus`, `testAccess`), `src/services/auth.service.ts` (`login`, `register`, `health`).
- **Context:** `src/context/AuthContext.tsx` + `src/hooks/useAuth.ts` — JWT parse, `isAuthenticated`, `hasRole()`, expiry clear.
- **Guard:** `src/routes/ProtectedRoute.tsx` — redirects unauthenticated / wrong-role to `/login` (booking, profile, atc).
- **Types:** `src/types/auth.ts` (`LoginRequest`, `RegisterRequest`, `AuthResponse`, `JwtPayload`, `Role`) and `src/types/api.ts` (DTOs matching backend: `FlightDto`, `FlightTrackingDto`, `AirportDto`, `WeatherDto`, `BookingRequest/Response`, `TelemetryResponse`, `AnomalyResponse`, `PageResponse`).
- **Shared components:** `src/components/tracking/TrackingMap.tsx` (Leaflet + OSM, no key, reused tracking/airports/ATC), `src/components/aircraft/AircraftViewer.tsx` (R3F procedural), `src/components/atc/*` (inline in AtcPage).

## Aircraft — IMPLEMENTED (foundation)

No `GET /api/aircraft` exists — backend comment in `FlightDto` is source. **Implemented** `AircraftPage.tsx` that reuses `FlightDto` aircraft fields (`aircraftRegistration/Iata/Icao`) via `flightService.search()` + procedural Three.js viewer (`@react-three/fiber` + `drei OrbitControls`). Real `.glb` asset documented to be placed at `public/models/aircraft.glb`; current uses primitive meshes to avoid licensing risk. No fake “3D image”.

## Profile — **IMPLEMENTED**

`ProfilePage.tsx` — `useAuth` username/role/id, session expiry (`exp`) + `Active` badge, logout via `AuthContext.logout()`. **No JWT token displayed** (prefix removed for production). Booking summary via `bookingService.listMyBookingsPaginated(0,5)` + fallback to `listMyBookings()`. No `PUT /api/user` exists — no fake email/avatar/password UI intentionally omitted. Route `/profile` protected.

## Maps

- **Library:** `leaflet` + `react-leaflet` with OSM tiles `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`. **No API key** required. Graceful empty state if no coordinates. Used by `TrackingMap.tsx` (tracking + airports detail + ATC) — single implementation reused. Historical path not fabricated — only live point line.
- **3D:** `three` + `@react-three/fiber` + `@react-three/drei`. Procedural model + `OrbitControls` + `Grid` + `Environment`. Responsive `Canvas` h-[420px].

## Environment Variables

- `VITE_API_BASE_URL` (required, see `.env.example` + `frontend/.env`). Points to Render in production, `http://localhost:8080` locally. Never hardcode Render URL. `frontend/.env` is gitignored via `frontend/.gitignore` `.env` rule; only `frontend/.env.example` is tracked.
- Map: no `VITE_MAPBOX_TOKEN` needed for OSM; example placeholder kept in `.env.example` for future.
- 3D: asset path `public/models/aircraft.glb` documented, not committed.
- Secrets: `JWT_SECRET`, `DATABASE_URL`, `AVIATIONSTACK_API_KEY` **never** in `VITE_*` — remain backend env only.

## Performance (Part 3 + Part 4)

Route-level lazy loading via `React.lazy` + `Suspense` for Tracking, Booking, Airports, Aircraft, ATC, Profile splits bundles: `TrackingMap 171k`, `AircraftPage 961k` isolated from `index 366k`. Build passes with `tsc -b && vite build` and `npx tsc --noEmit` (no `any`).

## Vercel Deployment

- `frontend/vercel.json` → `{ rewrites: [{ source: "/(.*)", destination: "/index.html" }], buildCommand: "npm run build", outputDirectory: "dist" }` ensures SPA deep links (`/tracking`, `/airports/DEL`, `/atc`) work via React Router.
- Vercel project root: `frontend/`. Install `npm install`, build `npm run build`. No secrets needed beyond `VITE_API_BASE_URL`.
- `vite.config.ts` uses `@tailwindcss/vite` + `@/ → src` alias via `import.meta.dirname` – production compatible.

---

## What is NOT yet wired (intentionally deferred)

- Real GLB aircraft model (procedural foundation present)
- WebSockets (REST only)
- AI chatbot/RAG/MCP, ML delay/price/demand predictions, anomaly ML (backend placeholder only)
- Admin dashboard, payments, notifications, OAuth
