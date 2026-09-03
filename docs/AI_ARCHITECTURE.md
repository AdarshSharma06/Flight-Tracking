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

## H. AI-3: Tool Calling Architecture

### Tool Abstraction

Tools are defined as Python classes inheriting from `Tool` (in `app/tools/base.py`):

```python
class Tool(ABC):
    name: str           # Unique tool name for LLM
    description: str    # Shown to the LLM
    parameters: dict    # JSON Schema for parameters
    execute(**kwargs) -> ToolResult
```

Tools are registered in a global `ToolRegistry` and discovered by the LLM via OpenAI-compatible tool definitions.

### Available Tools

| Tool | Description | Spring Boot Endpoint |
|------|-------------|---------------------|
| `get_flight_status` | Flight status and details | `GET /api/ai/proxy/flights/{number}` |
| `get_flight_tracking` | Live tracking/position | `GET /api/ai/proxy/flights/{number}/tracking` |
| `get_airport_information` | Airport details | `GET /api/ai/proxy/airports/{iata}` |
| `get_airport_departures` | Departing flights | `GET /api/ai/proxy/airports/{iata}/departures` |
| `get_airport_arrivals` | Arriving flights | `GET /api/ai/proxy/airports/{iata}/arrivals` |
| `get_weather` | Weather at airport | `GET /api/ai/proxy/weather/airport/{iata}` |
| `search_flights` | Search flights by criteria | `GET /api/ai/proxy/flights/search` |

### Communication Flow

```
User message
    ↓
ChatService (RAG check → system prompt → agentic loop)
    ↓
LLM (with tool definitions)
    ↓
LLM decides: answer directly OR call tool(s)
    ↓
ToolRegistry.execute(tool_name, args)
    ↓
Spring Boot proxy (/api/ai/proxy/*)
    ↓
Existing services → AviationStack / Open-Meteo / DB
    ↓
Tool result → LLM → Final natural language response
```

### Agentic Loop

The `ChatService._agentic_loop()` method implements the tool-calling loop:
1. Send messages + tool definitions to LLM
2. If LLM returns tool_calls → execute each tool, append results to messages
3. Re-send to LLM (up to 5 iterations)
4. When LLM returns content (no tool_calls) → return final response

### RAG + Tools Coexistence

- **RAG** handles knowledge questions (keyword-matched: "what is", "explain" + aviation terms)
- **Tools** handle live data questions (LLM-decided via tool calling)
- RAG context is injected into the system prompt before tool calling begins
- Both systems operate independently and do not conflict

### Security

- All tool execution goes through `ToolRegistry.execute()` — arbitrary tool names are rejected
- Spring Boot proxy endpoints validate `X-AI-Service-Key` header
- No direct access to aviation providers, databases, or arbitrary URLs
- Tool arguments are validated against JSON Schema before execution
- Live data fabrication is prevented by system prompt instructions

### Production Configuration

Required environment variables for the AI service:

| Variable | Description |
|----------|-------------|
| `SPRING_BOOT_BASE_URL` | URL of deployed Spring Boot backend |
| `AI_SERVICE_API_KEY` | Shared secret with Spring Boot |
| `LLM_PROVIDER` | LLM provider (e.g., `openai-compatible`) |
| `LLM_API_KEY` | LLM API key (e.g., OpenRouter key) |
| `LLM_MODEL` | Model name (e.g., `nvidia/nemotron-3-super-120b-a12b:free`) |
| `LLM_BASE_URL` | LLM API base URL |
| `DATABASE_URL` | PostgreSQL connection (for RAG) |

---

*This document defines the target architecture. AI-0 through AI-2 are complete. AI-3 implements tool calling for live flight, airport, and weather data.*