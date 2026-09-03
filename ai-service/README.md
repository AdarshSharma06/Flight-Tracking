# Flight Tracking AI Service

A FastAPI-based AI backend service for the Flight Tracking application.

## Overview

This service provides the AI backend for the Flight Tracking application. It handles:

- LLM interactions (abstraction layer for multiple providers)
- RAG (Retrieval-Augmented Generation) over aviation documentation
- Tool orchestration for flight search, tracking, and booking
- MCP (Model Context Protocol) integration
- Agent workflows (LangGraph)
- Memory management
- Guardrails and evaluation
- Observability and tracing

## Architecture

```
React (Frontend)
    ↓
Spring Boot (Backend)
    ↓
FastAPI AI Service (this service)
    ↓
LLM / RAG / Tools / MCP / Agents
```

Spring Boot remains the main application backend. The AI service is a separate FastAPI service that Spring Boot communicates with via HTTP.

## Quick Start

### Prerequisites

- Python 3.11+
- uv (recommended) or pip

### Installation

```bash
cd ai-service

# Create virtual environment (recommended)
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:
- `SPRING_BOOT_BASE_URL` - URL of the Spring Boot backend (default: http://localhost:8080)

Optional:
- `LLM_PROVIDER` - LLM provider (openai, anthropic, ollama, etc.)
- `LLM_API_KEY` - API key for LLM provider
- `LLM_MODEL` - Model name
- `DATABASE_URL` - PostgreSQL connection string
- `VECTOR_DATABASE_URL` - pgvector connection string
- `PORT` - Service port (default: 8001)

### Running the Service

```bash
# Development mode with auto-reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001

# Production mode
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

### Health Check

```bash
curl http://localhost:8001/health
# Response: {"status": "UP", "service": "flight-tracking-ai-service"}
```

## Project Structure

```
ai-service/
├── app/
│   ├── main.py                 # FastAPI application entry point
│   ├── config.py               # Configuration management
│   ├── api/
│   │   ├── __init__.py
│   │   └── health.py           # Health check endpoints
│   ├── llm/                    # LLM abstraction layer (placeholder)
│   ├── rag/                    # RAG implementation (placeholder)
│   ├── tools/                  # Tool definitions (placeholder)
│   ├── mcp/                    # MCP integration (placeholder)
│   ├── agents/                 # Agent workflows (placeholder)
│   ├── memory/                 # Memory management (placeholder)
│   ├── guardrails/             # Guardrails (placeholder)
│   ├── evaluation/             # Evaluation framework (placeholder)
│   ├── observability/
│   │   ├── __init__.py
│   │   └── logging.py          # Structured logging
│   └── api/
│       ├── __init__.py
│       └── health.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_config.py
│   └── test_health.py
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

## API Endpoints (Planned)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/health/ready` | GET | Readiness check |
| `/api/ai/chat` | POST | Conversational AI (planned) |
| `/api/ai/recommend` | POST | Flight recommendations (planned) |
| `/api/ai/atc/explain` | POST | ATC anomaly explanation (planned) |

## Communication with Spring Boot

Spring Boot communicates with this service via HTTP:

```
Spring Boot → AiServiceClient → HTTP GET/POST → FastAPI
```

The Spring Boot `AiServiceClient` uses a shared secret (`AI_SERVICE_API_KEY`) for authentication.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HOST` | Server host | `0.0.0.0` |
| `PORT` | Server port | `8001` |
| `ENVIRONMENT` | Environment | `development` |
| `SPRING_BOOT_BASE_URL` | Spring Boot base URL | `http://localhost:8080` |
| `AI_SERVICE_API_KEY` | Shared secret for Spring Boot auth | - |
| `LLM_PROVIDER` | LLM provider | - |
| `LLM_API_KEY` | LLM API key | - |
| `LLM_MODEL` | LLM model | - |
| `DATABASE_URL` | PostgreSQL URL | - |
| `VECTOR_DATABASE_URL` | pgvector URL | - |
| `LOG_LEVEL` | Log level | `INFO` |

## Testing

```bash
# Run all tests
pytest tests/ -v

# Run specific test
pytest tests/test_config.py -v
pytest tests/test_health.py -v
```

## Deployment

### Docker (Planned)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

### Render (Target)

- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port 8001`
- Environment variables configured in Render dashboard

## What's NOT Implemented Yet (AI-1+)

- LLM calls and provider abstraction
- RAG implementation
- Embeddings and pgvector
- Document ingestion
- Vector search
- Function calling / Tools
- MCP server/tools
- LangGraph agents
- Memory implementation
- Flight recommendation logic
- ML models
- Delay/price prediction
- WebSockets
- Guardrails
- Evaluation framework
- LLM tracing

## License

Part of Flight Tracking application.