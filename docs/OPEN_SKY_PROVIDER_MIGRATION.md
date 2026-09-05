# AviationStack → AeroDataBox + OpenSky Migration

**Date:** September 6, 2026
**Status:** Implementation Complete
**Decision:** Full provider migration (AviationStack decommissioned)

---

## Executive Summary

AviationStack was replaced with a hybrid provider architecture:
- **AeroDataBox** (via API.Market) — commercial flight data (search, details, arrivals, departures)
- **OpenSky Network** — live ADS-B telemetry (position, altitude, velocity, heading)

The application's API contracts remain unchanged. Frontend and AI service required zero modifications.

---

## 1. Architecture

### Before (AviationStack)
```
React UI → Spring Boot → AviationStack REST API
                       → Open-Meteo (weather)
                       → OpenStreetMap Nominatim (geocoding)
```

### After (AeroDataBox + OpenSky)
```
React UI → Spring Boot → FlightProvider (interface)
                       ├── AeroDataBoxFlightProvider → AeroDataBox API.Market
                       └── TrackingProvider (interface)
                           └── OpenSkyClient → OpenSky Network API (OAuth2)
                       → Open-Meteo (weather) — unchanged
                       → OpenStreetMap Nominatim (geocoding) — unchanged
```

### Provider Abstraction
| Interface | Implementation | Responsibility |
|-----------|---------------|----------------|
| `FlightProvider` | `AerodataboxFlightProvider` | Commercial flight data: search, details, arrivals, departures |
| `TrackingProvider` | `OpenSkyClient` | Live ADS-B telemetry: position, velocity, heading, altitude |

---

## 2. Files Created

| File | Purpose |
|------|---------|
| `backend/.../provider/FlightProvider.java` | Provider interface for commercial flight data |
| `backend/.../provider/TrackingProvider.java` | Provider interface for live ADS-B telemetry |
| `backend/.../provider/AerodataboxFlightProvider.java` | AeroDataBox implementation of FlightProvider |
| `backend/.../client/AerodataboxClient.java` | HTTP client for AeroDataBox API.Market |
| `backend/.../client/AerodataboxResponse.java` | AeroDataBox API response DTOs |
| `backend/.../client/OpenSkyClient.java` | OpenSky client with OAuth2 token management |
| `backend/.../config/AerodataboxProperties.java` | AeroDataBox configuration properties |
| `backend/.../config/OpenSkyProperties.java` | OpenSky configuration properties |

## 3. Files Modified

| File | Changes |
|------|---------|
| `backend/.../service/FlightService.java` | Replaced AviationStackClient with FlightProvider + TrackingProvider |
| `backend/.../service/AirportService.java` | Replaced AviationStackClient with FlightProvider |
| `backend/.../config/RestClientConfig.java` | Added AeroDataBox and OpenSky RestClient beans |
| `backend/src/main/resources/application.yml` | Added AeroDataBox and OpenSky config sections |
| `backend/.env.example` | Updated with AeroDataBox and OpenSky placeholders |
| `docs/OPEN_SKY_PROVIDER_MIGRATION.md` | This document |

## 4. Files Modified (Tests)

| File | Changes |
|------|---------|
| `backend/.../service/FlightServiceTest.java` | Mock FlightProvider + TrackingProvider instead of AviationStackClient |
| `backend/.../service/FlightServiceDelayTest.java` | Updated to test provider-based delay computation |
| `backend/.../service/AirportServiceTest.java` | Mock FlightProvider instead of AviationStackClient |
| `backend/.../Part4IntegrationTest.java` | Mock FlightProvider + TrackingProvider instead of AviationStackClient |

## 5. Files NOT Modified

- All frontend files (zero changes)
- All AI service files (zero changes)
- All controller files (endpoints unchanged)
- All DTO files (FlightDto, FlightSearchResponse, FlightTrackingDto)
- Weather-related files (Open-Meteo unchanged)
- Memory, guardrails, RAG, MCP, LangGraph files

---

## 6. AeroDataBox Endpoints Used

| Endpoint | Method | Purpose | Tier |
|----------|--------|---------|------|
| `/flights/number/{flightNumber}/{date}` | GET | Flight details by IATA number | TIER 2 |
| `/flights/airports/iata/{code}` | GET | Airport FIDS (departures/arrivals) | TIER 2 |
| `/airports/iata/{code}` | GET | Airport information by IATA | TIER 1 |

### Authentication
- Header: `x-api-market-key: <secret>`
- Base URL: `https://prod.api.market/api/v1/aedbx/aerodatabox`

---

## 7. OpenSky Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/states/all?icao24={icao24}` | GET | Live state vector by ICAO24 |
| `/states/all?callsign={callsign}` | GET | Live state vector by callsign |

### OAuth2 Token Management
- Token endpoint: `https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token`
- Flow: Client credentials (client_id + client_secret)
- Token caching: Cached with 30-minute expiry minus 30-second buffer
- Thread-safe: `synchronized` refresh with double-check pattern
- **Credentials required**: Throws `ExternalApiException` (503) if `OPENSKY_CLIENT_ID` or `OPENSKY_CLIENT_SECRET` are missing — no anonymous fallback
- Tokens are NEVER logged

### Licensing
OpenSky's REST API for operational/live-product use requires an appropriate permission or license per the [OpenSky Network terms](https://opensky-network.org/). Anonymous access is rate-limited and intended for research. This application requires authenticated access via OAuth2 client credentials.

---

## 8. Application Capability → Provider Mapping

| Application Endpoint | Provider | Notes |
|---------------------|----------|-------|
| `GET /api/flights/search` | AeroDataBox | Flight by number or FIDS-based search |
| `GET /api/flights/{flightNumber}` | AeroDataBox | `/flights/number/{number}/{today}` |
| `GET /api/flights/{flightNumber}/tracking` | AeroDataBox + OpenSky | Commercial data + live telemetry merge |
| `GET /api/airports/{iata}` | AeroDataBox → AirportClient fallback | AeroDataBox `/airports/iata/{code}` primary, local JSON fallback |
| `GET /api/airports/{iata}/departures` | AeroDataBox | FIDS departures board |
| `GET /api/airports/{iata}/arrivals` | AeroDataBox | FIDS arrivals board |
| `GET /api/weather` | Open-Meteo | Unchanged |
| `GET /api/weather/airport/{iata}` | Open-Meteo | Unchanged |
| All AI proxy endpoints | Through FlightService/AirportService | Same flow, new providers |

---

## 9. IATA/ICAO/Callsign/ICAO24 Mapping

### AeroDataBox
- Uses IATA airport codes natively (no conversion needed)
- Flight numbers are IATA (e.g., `6E123`)
- Aircraft identified by: registration (`reg`), Mode-S (`modeS`), model
- Airline identified by: IATA code, ICAO code, name

### OpenSky
- Uses ICAO24 hex addresses (e.g., `abc123`)
- Uses callsigns (e.g., `IGO123`)
- Does NOT use IATA codes

### Bridge Between Providers
The tracking merge in `FlightService.getTracking()` resolves OpenSky data via:
1. **Mode-S / ICAO24** (from AeroDataBox `aircraft.modeS`) → most reliable
2. **Callsign** (from AeroDataBox `flight.callSign` or `flight.number`) → fallback
3. If neither resolves, live telemetry fields remain null

---

## 10. Live Tracking Merge Strategy

```
AeroDataBox provides:
  - Flight identity (number, airline, route)
  - Flight status (scheduled, active, landed, etc.)
  - Scheduled/estimated/actual times
  - Terminal, gate information
  - Aircraft registration, model, Mode-S

OpenSky provides:
  - Latitude, longitude
  - Barometric/geometric altitude
  - Velocity (ground speed)
  - Heading (true track)
  - Vertical rate
  - Squawk code
  - On-ground state
  - Last contact timestamp
```

### Merge Rules
- Commercial data from AeroDataBox is always present
- Live telemetry from OpenSky is attempted via Mode-S or callsign bridge
- If OpenSky data is available, live fields are preferred over null commercial fields
- Valid commercial data is NEVER overwritten with null OpenSky data
- Delays are computed by the provider (AeroDataBox) from scheduled vs actual timestamps

---

## 11. Null/Unavailable Data Handling

- If AeroDataBox returns no results → `ResourceNotFoundException`
- If OpenSky has no live data for an aircraft → live telemetry fields remain null
- If Mode-S/callsign bridge fails → tracking returns commercial-only data (no live position)
- If a field is not provided by the provider → `null` in DTO
- No fake data is ever invented

---

## 12. Rate Limit Handling

### AeroDataBox
- Paid API.Market subscription with credit-based billing
- Different endpoints cost different amounts (TIER 1/2/3)
- TIER 1: airports (cheapest)
- TIER 2: flights, FIDS (moderate)
- TIER 3: delays, statistics (most expensive)
- No special rate-limit handling beyond standard HTTP error handling

### OpenSky
- Credit buckets: 400/day (anonymous), 4,000/day (standard), 8,000/day (feeder)
- Rate limits: 10s (anonymous), 5s (authenticated)
- `X-Rate-Limit-Remaining` and `X-Rate-Limit-Retry-After-Seconds` headers on 429
- OAuth2 tokens cached to avoid unnecessary token requests

---

## 13. AviationStack Decommission Status

- **Runtime dependency removed**: No code path calls AviationStack
- **AviationStackClient.java**: Still exists on disk but is no longer injected into any service
- **AviationStackProperties.java**: Still exists but not actively used
- **application.yml**: AviationStack config retained for rollback documentation but not required for startup
- **.env**: AviationStack key retained in local .env for rollback but not required
- **Tests**: All tests now mock FlightProvider/TrackingProvider (not AviationStackClient)

---

## 14. Open-Meteo Status

**Unchanged.** Weather provider remains Open-Meteo. No weather-related files were modified.

---

## 15. Frontend Changes

**Zero changes.** All existing API contracts are preserved:
- Same endpoint paths
- Same query parameters
- Same response DTOs (FlightDto, FlightTrackingDto, FlightSearchResponse)
- Same error semantics

---

## 16. AI Service Changes

**Zero changes.** AI tools continue to call Spring Boot endpoints:
- `flight_tools.py` → `/api/ai/proxy/flights/{number}` and `/api/ai/proxy/flights/{number}/tracking`
- `airport_tools.py` → `/api/ai/proxy/airports/{iata}` and departures/arrivals
- `weather_tools.py` → `/api/ai/proxy/weather/airport/{iata}`
- `flight_search.py` → `/api/ai/proxy/flights/search`

---

## 17. Test Results

| Suite | Result |
|-------|--------|
| Spring Boot | **76 passed, 0 failures** |
| AI Service (FastAPI) | **574 passed** |
| Frontend TypeScript | **Clean** |
| Frontend Build | **Successful** |

---

## 18. Security Audit

- No hardcoded secrets in source code
- `.env` files properly gitignored
- All secrets injected via environment variables
- OAuth2 tokens never logged
- API keys never logged
- Authorization headers never logged

---

## 19. Known Limitations

1. **AeroDataBox FIDS uses relative time window** — defaults to -120min to +720min from current time. Historical departures/arrivals beyond this window are not available via FIDS.
2. **OpenSky tracking requires Mode-S or callsign bridge** — not all IATA flight numbers map cleanly to OpenSky callsigns. When bridge fails, live telemetry is unavailable.
3. **OpenSky licensing required** — operational/live-product use requires an appropriate permission or license per OpenSky terms. See [Section 7](#7-opensky-endpoints-used).
4. **AeroDataBox is paid** — credits are consumed per request. TIER 2/3 endpoints cost more.
5. **AviationStackClient still exists** — not deleted to allow rollback. Can be removed in a future cleanup pass.
6. **Airport fallback chain** — AeroDataBox → local JSON fallback means airport info may be stale if local JSON is outdated.

---

## 21. Flight Search Filter Mapping (Verified)

| Search Parameter | AeroDataBox Endpoint | Native vs Local | Notes |
|-----------------|---------------------|-----------------|-------|
| `flight_iata` | `/flights/number/{number}/{date}` | **Native** | Direct flight number lookup |
| `dep_iata` | `/flights/airports/iata/{code}?direction=Departure` | **Native** | FIDS departures board |
| `arr_iata` | `/flights/airports/iata/{code}?direction=Arrival` | **Native** | FIDS arrivals board |
| `airline_iata` | — | **Local only** | AeroDataBox FIDS has no airline filter param |
| `flight_status` | — | **Local only** | AeroDataBox FIDS has no status filter param |
| `limit` | — | **Local only** | AeroDataBox FIDS has no limit param |

When both `dep_iata` and `arr_iata` are provided, FIDS fetches departures from `dep_iata` and applies `arr_iata` as a local filter.

---

## 20. Manual Live API Tests

**Not performed** — live API calls were not tested during this implementation. All testing was done via mocked HTTP responses in unit tests. To verify live functionality:
1. Ensure `.env` has valid `AERODATABOX_API_KEY`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`
2. Start Spring Boot locally
3. Call `GET /api/flights/search?flight_iata=6E123` (requires auth)
4. Call `GET /api/flights/6E123/tracking` (requires auth)
5. Verify AeroDataBox returns flight data
6. Verify OpenSky returns live telemetry when available
