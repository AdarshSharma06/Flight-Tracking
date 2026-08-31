# Flight Tracking Backend — Part 1 Foundation

Minimal, production-oriented Spring Boot foundation for the Flight Tracking web application.
This is **Part 1 only**: project setup, PostgreSQL/Supabase, JPA, Flyway, health endpoint.

## Technology Stack

| Component | Version | Notes |
|-----------|---------|-------|
| Java | 21 (LTS) | Required by Spring Boot 3.4.x |
| Spring Boot | 3.4.7 | Current stable 3.4 line, via `spring-boot-starter-parent` |
| Maven | 3.9.9 | Via Maven Wrapper (`./mvnw`) |
| PostgreSQL driver | 42.7.x (managed) | Supabase-compatible |
| Flyway | 10.20.x (managed) + `flyway-database-postgresql` | |
| H2 | test scope only | In-memory DB for tests, isolated from prod |

## Project Structure

```
src/main/java/com/flighttracking/
  FlightTrackingApplication.java
  config/AppConfig.java
  controller/HealthController.java   -> GET /api/health
  service/HealthService.java
  dto/HealthResponse.java            -> example DTO (controllers return DTOs, not entities)
  dto/ApiErrorResponse.java          -> standardized error envelope
  exception/GlobalExceptionHandler.java
  exception/ResourceNotFoundException.java
  entity/        (reserved for future domain entities)
  repository/    (reserved for future Spring Data repos)
src/main/resources/
  application.yml
  application-dev.yml
  db/migration/V1__baseline.sql
src/test/
  java/com/flighttracking/controller/HealthControllerTest.java
  resources/application-test.yml  (H2, Flyway disabled, create-drop)
```

Future modules (`flight`, `airport`, `booking`, `atc`, `auth`) will be added as sub-packages
e.g. `com.flighttracking.flight.*` without restructuring the foundation.

## Configuration

Secrets are **never hardcoded**. All DB credentials come from environment variables:

| Env var | Purpose | Example |
|---------|---------|---------|
| `DATABASE_URL` | JDBC URL | `jdbc:postgresql://db.<ref>.supabase.co:5432/postgres?sslmode=require` |
| `DATABASE_USERNAME` | DB user | `postgres` |
| `DATABASE_PASSWORD` | DB password | — |
| `PORT` | Server port | `8080` (Render sets this automatically) |

Defaults allow local development without Supabase:

```properties
DATABASE_URL=jdbc:postgresql://localhost:5432/flight_tracking
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
```

Copy `.env.example` to `.env` (ignored by git) or export variables in your shell.

`application.yml` uses `${VAR:default}` placeholders; `application-dev.yml` enables SQL logging;
`application-test.yml` switches to H2 and disables Flyway for tests.

Supabase requires `?sslmode=require` in the JDBC URL.

## How to Run Locally

```bash
# 1. Set env vars (example for local Postgres)
export DATABASE_URL=jdbc:postgresql://localhost:5432/flight_tracking
export DATABASE_USERNAME=postgres
export DATABASE_PASSWORD=postgres

# Create DB if needed
createdb flight_tracking

# 2. Build
./mvnw clean package

# 3. Run
./mvnw spring-boot:run
# or
java -jar target/flight-tracking-backend-0.0.1-SNAPSHOT.jar
```

For Supabase, set `DATABASE_URL` to the Supabase pooled/connection string.

## How to Run Tests

```bash
./mvnw test
```

Tests use H2 in-memory DB (`application-test.yml`, Flyway disabled, `ddl-auto: create-drop`).
Production code always uses PostgreSQL.

## Health Endpoint

```bash
curl http://localhost:8080/api/health
```

Response:

```json
{
  "status": "UP",
  "application": "flight-tracking-backend",
  "timestamp": "2026-09-01T02:00:00Z"
}
```

## Database Migrations

* Tool: Flyway, runs automatically on startup
* Locations: `classpath:db/migration`
* Naming: `V<version>__<description>.sql` (e.g. `V2__add_flight_table.sql`)
* `V1__baseline.sql` creates a minimal `schema_version_demo` table to prove Flyway works against PostgreSQL.
  Domain tables will be added in later parts.
* `spring.jpa.hibernate.ddl-auto=validate` ensures entities never auto-modify schema; Flyway is the source of truth.
* Test profile disables Flyway and uses JPA `create-drop` with H2.

Add a new migration by creating `V2__...sql` under `src/main/resources/db/migration`; it will run on next startup.

## DTO Convention

Controllers return DTOs (`com.flighttracking.dto`), never JPA entities. `HealthResponse` demonstrates this.
Future domain entities will have corresponding DTOs and manual or MapStruct mapping.

## Exception Handling

`GlobalExceptionHandler` (`@RestControllerAdvice`) converts exceptions into `ApiErrorResponse`:

```json
{
  "timestamp": "...",
  "status": 404,
  "error": "Not Found",
  "message": "...",
  "path": "/api/...",
  "details": null
}
```

Throw `ResourceNotFoundException` (or any future domain exception) from services/controllers and it will be handled consistently.

## Deployment (Render)

Configuration is Render-compatible: `server.port=${PORT:8080}` and `DATABASE_URL` from Render env vars
pointing to Supabase (`?sslmode=require`). No code change needed.

## What Is NOT Included (Later Parts)

Auth, JWT, flight/airport/booking/ATC logic, aviation APIs, AI/ML, React, WebSockets — intentionally omitted per Part 1 scope.
