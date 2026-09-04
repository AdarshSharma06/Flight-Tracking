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

## J. AI-5: LangGraph Flight Recommendation Agent

### Why LangGraph

LangGraph provides an explicit **state graph** for multi-step agent workflows. Unlike a simple LLM → prompt → answer loop, LangGraph:

1. **Enforces structure**: Each step is a named node with typed state
2. **Enables branching**: Conditional edges route based on data availability
3. **Provides observability**: Graph execution is traceable node-by-node
4. **Supports state**: Typed state flows through the entire workflow
5. **Integrates with LangChain ecosystem**: Compatible with existing tools and LLM abstractions

### Recommendation Workflow

```
START
  ↓
parse_preferences    (LLM extracts structured preferences from natural language)
  ↓
search_flights       (ToolRegistry → Spring Boot → flight data provider)
  ↓
enrich_flights       (Optional: get_flight_status — NOT get_flight_tracking)
  ↓
get_weather          (ToolRegistry → Spring Boot → weather data)
  ↓
get_predictions      (Placeholder for AI-11 ML models)
  ↓
score_flights        (Deterministic multi-factor scoring)
  ↓
rank_flights         (Sort by score, descending)
  ↓
generate_recommendation  (LLM generates human-readable explanation)
  ↓
END
```

### Agent State

The agent uses a typed `RecommendationState` dataclass:

| Field | Type | Description |
|-------|------|-------------|
| `user_request` | `str` | Original natural language request |
| `preferences` | `UserPreferences` | Parsed structured preferences |
| `candidate_flights` | `list[FlightCandidate]` | Flights from search |
| `weather_data` | `dict[str, WeatherInfo]` | Weather by airport IATA |
| `prediction_data` | `dict[str, PredictionInfo]` | Delay predictions (placeholder) |
| `scored_flights` | `list[ScoredFlight]` | Flights with computed scores |
| `ranked_flights` | `list[ScoredFlight]` | Scored flights sorted by score |
| `recommendation` | `RecommendationResult` | Final output |
| `errors` | `list[str]` | Accumulated error messages |
| `unavailable_data` | `list[str]` | Markers for missing data |
| `price_data_available` | `bool` | Whether flight search returned price data |

### Graph Nodes

| Node | Purpose | Uses LLM? | Uses Tools? |
|------|---------|-----------|-------------|
| `parse_preferences` | Extract structured preferences from NL | Yes | No |
| `search_flights` | Search flights by route | No | Yes (search_flights) |
| `enrich_flights` | Get flight status details | No | Yes (get_flight_status) |
| `get_weather` | Weather at origin/destination | No | Yes (get_weather) |
| `get_predictions` | Delay prediction placeholder | No | No (returns unavailable) |
| `score_flights` | Deterministic multi-factor scoring | No | No |
| `rank_flights` | Sort scored flights | No | No |
| `generate_recommendation` | Human-readable explanation | Yes | No |

### Tool Interaction

The recommendation agent reuses existing AI-3 tools through the same `ToolRegistry`:

```
Recommendation Node
    ↓
ToolRegistry.execute(tool_name, args)
    ↓
AI-3 Tool implementation (flight_tools, airport_tools, etc.)
    ↓
Spring Boot proxy (/api/ai/proxy/*)
    ↓
Existing services → AviationStack / Open-Meteo / DB
```

**Tools used by the recommendation agent:**
- `search_flights` — search flights by route
- `get_flight_status` — enrich candidates with status/aircraft/airline details
- `get_weather` — weather conditions at origin/destination airports

**Tools NOT used (intentionally):**
- `get_flight_tracking` — live aircraft position is irrelevant for recommendation scoring
- `get_airport_information` — airport details not needed for scoring
- `get_airport_departures` / `get_airport_arrivals` — not needed for route-specific search

### Deterministic Scoring

Scoring is **purely data-driven** — the LLM does not decide which flight is "best".

| Factor | Weight | Source |
|--------|--------|--------|
| `direct_preference` | 0.30 | User preference + flight data |
| `departure_convenience` | 0.15 | Parsed travel time vs actual departure |
| `arrival_convenience` | 0.15 | Arrival time during reasonable hours |
| `weather_impact` | 0.10 | Weather conditions at airport |
| `status_health` | 0.10 | Flight status (active, delayed, etc.) |
| `delay_risk` | 0.10 | Delay prediction (when available) |
| `airline_match` | 0.10 | Airline preference match |

Missing data results in neutral scores (0.5), never fabricated values.

### Budget and Price Data

Flight search results do **not** include ticket prices. The scoring system has no price factor. When a user specifies a budget:

- The `price_data_available` state flag is `False`
- The recommendation explicitly notes "Budget of X could not be verified — flight data does not include ticket prices" in limitations
- The LLM prompt explicitly instructs: "Do NOT state or imply that the recommended flight is within the user's budget"
- Future phases (AI-11) may add price prediction or API integration to populate prices

### Handling Unavailable Predictions

AI-5 does **not** implement ML predictions. The `get_predictions` node returns `PredictionInfo(available=False)` for all flights. The scoring system handles this gracefully:

- Delay risk score defaults to 0.5 (neutral) when prediction is unavailable
- The recommendation explicitly notes "Delay prediction unavailable (ML model pending)" in limitations
- When AI-11 implements prediction models, it plugs into the `get_predictions` node without redesigning the graph

### Relationship with Future ML (AI-11)

The `get_predictions` node is a clean integration point:

```python
# AI-5: returns unavailable
async def get_predictions(state):
    return {"prediction_data": {fn: PredictionInfo(available=False) for fn in ...}}

# AI-11: will call actual ML model
async def get_predictions(state):
    prediction = await ml_model.predict(flight)
    return {"prediction_data": {fn: PredictionInfo(available=True, delay_probability=p)}}
```

The scoring, ranking, and recommendation nodes require zero changes.

### Relationship with AI-3 Tools / MCP

- The recommendation agent uses the same `ToolRegistry` as ChatService (AI-3) and MCP (AI-4)
- No duplicate tool implementations
- MCP remains the standardized external tool interface
- The recommendation agent is an orchestration layer, not a replacement

### API Endpoint

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/recommend` | POST | Flight recommendation |

**Security**: The endpoint is protected by the same `X-AI-Service-Key` middleware as `/api/ai/chat`. When `ai_service_api_key` is configured in `config.py`, requests without a valid key receive `401 UNAUTHORIZED`. Both endpoints share identical security behavior — no bypass or exception is introduced.

Request:
```json
{
  "query": "Find me the best flight from Delhi to London tomorrow under ₹60,000, preferably direct."
}
```

Response:
```json
{
  "recommended_flight": {
    "flight": { "flight_number": "AI302", "origin": "DEL", "..." : "..." },
    "score": 0.85,
    "score_breakdown": { "..." : "..." },
    "weather_available": true,
    "prediction_available": false
  },
  "alternatives": [],
  "explanation": "Flight AI302 is recommended because...",
  "limitations": ["Delay prediction unavailable (ML model pending)"],
  "total_flights_evaluated": 5,
  "requestId": "..."
}
```

### What AI-5 Intentionally Does NOT Implement

- ML delay prediction models (→ AI-11)
- Price prediction / price increase forecasting (→ AI-11)
- Demand prediction (→ AI-11)
- Airport congestion prediction (→ AI-11)
- Conversation memory / preference memory (→ AI-6, now implemented)
- Guardrails / PII scrubbing (→ AI-8)
- Evaluation framework (→ AI-9)
- Observability / tracing (→ AI-10)
- Frontend redesign (→ Booking/SHR integration)

### Files

| File | Purpose |
|------|---------|
| `app/agents/__init__.py` | Agents package init |
| `app/agents/state.py` | Typed state models (RecommendationState, etc.) |
| `app/agents/nodes.py` | 8 LangGraph workflow nodes |
| `app/agents/ranking.py` | Deterministic scoring and ranking |
| `app/agents/recommendation_agent.py` | Graph construction and compilation |
| `app/api/recommendation.py` | API endpoint and request/response models |
| `tests/test_recommendation.py` | 73 AI-5 tests (incl. budget, enrichment, security) |
| `requirements.txt` | Added `langgraph>=0.2.0,<1.0` dependency |

---

*This document defines the target architecture. AI-0 through AI-5 are complete. AI-6 implements conversation and preference memory.*

---

## K. AI-6: Conversation and Preference Memory

### Overview

AI-6 adds persistent memory to the AI service, supporting two distinct types:

1. **Conversation Memory** — contextual history for continuing interactions across messages
2. **Preference Memory** — durable, structured user preferences for recommendations

### Architecture

```
Frontend (React)
  AiPage.tsx
    → sends message + optional conversationId
    → receives response + conversationId
    ↓
Spring Boot (Java)
  AiController → AiServiceClient
    → forwards X-User-Id header (username from JWT)
    ↓
FastAPI AI Service
  POST /api/ai/chat
    → middleware extracts X-User-Id
    → ChatService
      → get_or_create_conversation(user_id, conversation_id)
      → get_conversation_context(user_id, conversation_id)
      → LLM call with system prompt + history + current message
      → persist user message + assistant response
      → return response + conversationId
    ↓
PostgreSQL
  ai_conversation, ai_message, ai_user_preference tables
```

### Conversation Memory

**Storage:** PostgreSQL via asyncpg (separate pool from RAG, same DATABASE_URL)

**Tables:**
- `ai_conversation` — groups of related messages (id, user_id, title, timestamps)
- `ai_message` — individual messages (id, conversation_id, role, content, timestamp)

**Roles:** `user`, `assistant` only

**Bounded Context:**
- Maximum 20 recent messages per context window
- Maximum 8,000 characters total content
- Oldest messages trimmed first when budget exceeded
- Conversation ownership verified on every retrieval

**Conversation ID Flow:**
1. Frontend sends optional `conversationId` in chat request
2. If provided and valid, messages are appended to that conversation
3. If absent or invalid, a new conversation is created
4. Response always includes `conversationId` for follow-up messages

### Preference Memory

**Table:** `ai_user_preference` (user_id, preference_key, preference_value, unique constraint)

**Valid Preference Keys:**
| Key | Maps To | Example Values |
|-----|---------|----------------|
| `preferred_origin` | `origin` | `DEL`, `BOM` |
| `preferred_destination` | `destination` | `LHR`, `SIN` |
| `prefers_direct` | `direct_only` | `true`, `false` |
| `preferred_airline` | `airline_preference` | `AI`, `BA` |
| `budget_preference` | `budget` | `60000`, `500` |
| `preferred_departure_time` | `travel_time` | `10:00`, `18:00` |
| `preferred_arrival_time` | `arrival_time` | `14:00`, `08:00` |

**Only valid structured keys are stored.** Arbitrary text is rejected.

**Merging with AI-5 Recommendations:**
1. Stored preferences loaded as defaults before recommendation graph runs
2. `parse_preferences` node merges: LLM-extracted values override stored values
3. Explicit request values always take precedence over stored preferences
4. Null LLM values preserve stored defaults

**What Is NOT Stored:**
- Temporary trip details (dates, specific flights)
- Hallucinated or inferred preferences
- Sensitive personal information
- Arbitrary prose or natural language

### User Identity and Security

**Identity Source:** `X-User-Id` header, forwarded by Spring Boot from JWT `authentication.getName()`

**Middleware:** FastAPI extracts `X-User-Id` into `request.state.user_id`

**User Isolation:**
- All queries filter by `user_id`
- Cross-user access returns empty/not-found
- `get_conversation()` verifies `user_id` ownership
- `get_messages()` verifies conversation belongs to user
- Preferences are scoped by `user_id`

**No New Authentication:** Uses existing `X-AI-Service-Key` middleware (same as `/api/ai/chat`)

### Memory API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/ai/conversations` | GET | List user's conversations |
| `GET /api/ai/conversations/{id}` | GET | Get a specific conversation |
| `GET /api/ai/preferences` | GET | Get all user preferences |
| `POST /api/ai/preferences` | POST | Set/update a preference |
| `DELETE /api/ai/preferences/{key}` | DELETE | Delete a specific preference |
| `DELETE /api/ai/preferences` | DELETE | Clear all preferences |
| `GET /api/ai/preferences/valid-keys` | GET | List valid preference keys |

### Chat Integration

The existing `/api/ai/chat` flow is enhanced:

```
User message + optional conversationId
  ↓
Get/create conversation for user
  ↓
Retrieve bounded conversation context (max 20 msgs, 8k chars)
  ↓
RAG retrieval (if aviation knowledge question)
  ↓
Build messages: [system_prompt, ...history, user_message]
  ↓
LLM + tool calling loop
  ↓
Persist user message + assistant response
  ↓
Return response + conversationId
```

**Backward Compatibility:**
- `conversationId` is optional in request
- New conversation created automatically when absent
- Chat works without database (graceful fallback)
- Existing RAG and tool calling behavior unchanged

### Files

| File | Purpose |
|------|---------|
| `app/memory/__init__.py` | Memory package init |
| `app/memory/store.py` | asyncpg CRUD for conversations, messages, preferences |
| `app/memory/service.py` | Service layer with merge logic and validation |
| `app/api/memory.py` | Memory API endpoints |
| `app/api/chat_service.py` | Updated with conversation memory integration |
| `app/api/models.py` | Updated ChatRequest/ChatResponse with conversationId |
| `app/api/recommendation.py` | Updated with preference memory integration |
| `app/agents/nodes.py` | Updated parse_preferences to merge with stored prefs |
| `tests/test_memory.py` | 48 AI-6 tests |
| `V7__create_ai_memory_tables.sql` | Database migration |

### What AI-6 Intentionally Does NOT Implement

- Semantic conversation retrieval using embeddings
- Conversation summarization
- Long-term memory decay
- Preference learning from behavior
- Cross-session conversation search
- Guardrails / PII scrubbing (→ AI-8)
- Observability / tracing (→ AI-10)