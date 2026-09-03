# AI Architecture — Flight Tracking

## A. High-Level Architecture

```
React (Frontend)
    ↓
Spring Boot (Backend)
    ↓
FastAPI AI Service
    ↓
LLM / RAG / Tools / MCP / Agents
```

## B. Responsibilities of Spring Boot

Spring Boot remains the **primary application backend** and is responsible for:

- Authentication & Authorization (JWT, roles, Spring Security)
- User management
- Bookings (CRUD, history, pagination)
- Flight data (search, tracking, details via aviation APIs)
- Airports (lookup, departures, arrivals)
- ATC (telemetry, anomalies, status updates)
- Application database (PostgreSQL/Supabase via JPA/Hibernate)
- External aviation API integration (AviationStack → Aviation Edge)
- Weather APIs (Open-Meteo)
- AI request authentication & orchestration
- CORS, CORS preflight, rate limiting
- Database migrations (Flyway)
- Health checks, metrics, logging

## C. Responsibilities of FastAPI AI Service

FastAPI AI Service is the **dedicated AI backend** responsible for:

- LLM interaction (providers abstracted via interface)
- Prompt engineering & management
- RAG (embeddings, vector search, retrieval)
- Tool orchestration (function calling)
- MCP (Model Context Protocol) server/client
- Agent orchestration (LangGraph workflows)
- Memory (short-term, long-term, episodic)
- Guardrails (input/output validation, PII, safety)
- Evaluation framework (offline/online metrics)
- Observability (tracing, logging, cost tracking, latency)
- Structured error responses

## D. Why AI Logic Is Separated from Spring Boot

| Concern | Spring Boot | FastAPI AI Service |
|---------|-------------|-------------------|
| Language | Java 21 | Python 3.11+ |
| Ecosystem | Spring, JPA, Security | FastAPI, Pydantic, LangChain, LangGraph, pgvector |
| Runtime | JVM | Python async (uvicorn) |
| ML/AI libraries | Limited | Native (LangChain, LangGraph, transformers, etc.) |
| Deployment | JAR on Render | Python/uvicorn on Render |
| Team expertise | Java backend | Python AI/ML |

**Separation rationale:**
1. **Technology fit**: Python has superior ML/AI ecosystem (LangChain, LangGraph, pgvector, transformers, etc.)
2. **Scalability**: AI workloads (GPU, long-running) scale differently from request/response CRUD
3. **Independent deployment**: AI models can be updated/rolled back without touching core backend
4. **Team autonomy**: AI/ML engineers work in Python; backend engineers in Java
5. **Failure isolation**: AI service failures don't crash core booking/flight/ATC flows

## E. AviationStack → Aviation Edge Migration

The AI layer **must not** depend on AviationStack directly.

```
AI Service → Spring Boot (abstraction) → AviationStack / Aviation Edge
```

Spring Boot exposes **application-level capabilities**:

```java
interface AviationDataProvider {
    FlightStatus getFlightStatus(String flightNumber);
    FlightTracking getFlightTracking(String flightNumber);
    AirportInfo getAirportInformation(String iata);
    List<Flight> getAirportDepartures(String iata, int limit);
    List<Flight> getAirportArrivals(String iata, int limit);
    Weather getWeather(double lat, double lon);
    FlightSearchResult searchFlights(FlightSearchParams params);
}
```

The AI service consumes these **application-level capabilities**, not the raw external API. When AviationStack is replaced by Aviation Edge, only the Spring Boot implementation changes — the AI interface remains stable.

## F. Three AI Features

### 1. AI Aviation Assistant (Conversational)
- **Entry**: Chat interface in frontend
- **Capabilities**: Flight search, tracking, airport info, weather, booking help
- **Architecture**: RAG over aviation docs + tool calling (searchFlights, getTracking, getWeather)
- **Guardrails**: No PII in logs, no booking actions without confirmation, rate limits

### 2. AI Flight Recommendation
- **Entry**: Booking page / dedicated recommendation page
- **Input**: Origin, destination, date, budget, preferences (direct, time, delay risk)
- **Flow**: Agent → searches flights → ranks by preferences → explains reasoning
- **Future**: Weather/delay predictions, price trends, demand signals

### 3. AI ATC Explanation
- **Entry**: ATC dashboard (anomaly/telemetry detail view)
- **Input**: Anomaly record + related telemetry + flight context + weather
- **Output**: Human-readable explanation of anomaly (cause, severity, recommended action)
- **Guardrails**: LLM **never** detects anomalies; only explains what system detected

## G. Future AI Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **LLM** | Provider-agnostic (OpenAI, Anthropic, local via Ollama) | Generation, reasoning |
| **RAG** | pgvector + LangChain | Retrieval over aviation docs, manuals, regulations |
| **Vector DB** | PostgreSQL + pgvector (Supabase) | Embedding storage & similarity search |
| **Tools** | LangChain tools / Pydantic functions | Flight search, weather, booking, ATC lookups |
| **MCP** | Model Context Protocol | Standardized tool/server protocol |
| **Agents** | LangGraph | Multi-step workflows, planning, reflection |
| **Memory** | Short-term (conversation) + Long-term (user prefs, history) | Context persistence |
| **Guardrails** | Input/output validators, PII scrubbers | Safety, compliance |
| **Evaluation** | LangSmith / custom | Offline (golden sets) + online (user feedback) |
| **Observability** | LangSmith / OpenTelemetry / custom | Traces, costs, latency, token usage |

---

*This document defines the target architecture. AI-0 implements the foundation only (FastAPI service, Spring Boot client, contracts, DB schema docs). Actual AI features are deferred to AI-1+.*