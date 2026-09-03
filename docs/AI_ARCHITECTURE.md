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

## I. AI-4: MCP (Model Context Protocol) Architecture

### Why MCP

MCP provides a **standardized protocol** for exposing tools to AI systems. While AI-3 implemented tool calling via OpenAI-compatible function calling, MCP adds:

1. **Interoperability**: Any MCP-compatible client (Claude Desktop, Cursor, etc.) can discover and use the aviation tools
2. **Standardized schema**: Tool definitions follow the MCP specification, not just OpenAI's format
3. **Separation of concerns**: The MCP layer provides a clean interface between the AI service and external consumers
4. **Future-proofing**: As MCP adoption grows, the tools are immediately available to new AI platforms

### Architecture (Option B)

The application uses an **MCP adapter internally** while retaining the existing LLM tool-calling interface:

```
External MCP Clients (Claude Desktop, etc.)
    ↓ (MCP Protocol: JSON-RPC over SSE)
MCP Server (FastMCP at /mcp)
    ↓
ToolRegistry.execute()  ← same registry used by ChatService
    ↓
AI-3 Tool implementations (flight_tools, airport_tools, etc.)
    ↓
Spring Boot proxy (/api/ai/proxy/*)
    ↓
Existing services → AviationStack / Open-Meteo / DB
```

**Key decision**: The LLM (via ChatService) continues to use OpenAI-compatible function calling directly through the ToolRegistry. The MCP server is an **additional interface** that exposes the same tools via the MCP protocol. Both share the same underlying tool implementations — no duplication.

### MCP Tools Exposed

All 7 AI-3 aviation tools are exposed through MCP:

| MCP Tool | Description | Underlying AI-3 Tool |
|----------|-------------|---------------------|
| `get_flight_status` | Flight status and details | `GetFlightStatusTool` |
| `get_flight_tracking` | Live tracking/position | `GetFlightTrackingTool` |
| `get_airport_information` | Airport details | `GetAirportInformationTool` |
| `get_airport_departures` | Departing flights | `GetAirportDeparturesTool` |
| `get_airport_arrivals` | Arriving flights | `GetAirportArrivalsTool` |
| `get_weather` | Weather at airport | `GetWeatherTool` |
| `search_flights` | Search flights by criteria | `SearchFlightsTool` |

### MCP → AI-3 Tool Registry Relationship

The MCP server delegates all tool calls to the existing `ToolRegistry`:

```python
@mcp.tool()
async def get_flight_status(flight_number: str) -> str:
    result = await registry.execute("get_flight_status", {"flight_number": flight_number})
    return result.to_content()
```

This ensures:
- **No duplicate implementations**: MCP tools are thin wrappers
- **Consistent behavior**: Same validation, error handling, and Spring Boot communication
- **Single source of truth**: Tool logic lives in `app/tools/`, not in `app/mcp/`

### MCP → Spring Boot Relationship

MCP tools do **not** directly access Spring Boot. The flow is:

```
MCP tool call → ToolRegistry → AI-3 Tool → Spring Boot proxy client → Spring Boot API
```

The AI-3 tool's `execute()` method calls `client.get()` which sends requests to Spring Boot's `/api/ai/proxy/*` endpoints with the `X-AI-Service-Key` header. This preserves the existing security boundary.

### Authentication / Security

- **MCP server itself**: No authentication required (it's an internal adapter)
- **Tool execution**: Uses the same AI-3 `ToolRegistry.execute()` which validates tool names and arguments
- **Spring Boot communication**: Uses the existing `AI_SERVICE_API_KEY` shared secret via `X-AI-Service-Key` header
- **No secrets exposed**: MCP responses contain only tool results, never API keys, JWT tokens, or database credentials
- **No direct aviation API access**: MCP tools go through Spring Boot, never directly to AviationStack/Aviation Edge

### Transport

The MCP server is mounted on FastAPI at `/mcp` using **SSE (Server-Sent Events)** transport:

- `GET /mcp/sse` — SSE endpoint for receiving MCP messages
- `POST /mcp/messages/` — Endpoint for sending MCP requests

For local development, the MCP server can also run via **stdio** transport (for Claude Desktop integration).

### Production Configuration

No additional environment variables are required. The MCP server uses the same configuration as the AI service:

| Variable | Description |
|----------|-------------|
| `SPRING_BOOT_BASE_URL` | Used by underlying AI-3 tools |
| `AI_SERVICE_API_KEY` | Used by underlying AI-3 tools for Spring Boot auth |

### Files

| File | Purpose |
|------|---------|
| `app/mcp/__init__.py` | MCP package init |
| `app/mcp/server.py` | MCP server with 7 aviation tools |
| `tests/test_mcp.py` | 23 MCP tests |
| `requirements.txt` | Added `mcp>=1.28,<2` dependency |

---

*This document defines the target architecture. AI-0 through AI-3 are complete. AI-4 implements MCP as the standardized tool interface.*