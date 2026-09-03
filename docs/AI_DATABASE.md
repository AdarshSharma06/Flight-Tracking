# AI Database Architecture — Flight Tracking

> **Single database**: PostgreSQL/Supabase + pgvector
> No separate database for AI — all AI tables live in the same PostgreSQL instance as the main application.

---

## Overview

```
PostgreSQL (Supabase)
├── Core Application Tables (existing)
│   ├── users
│   ├── bookings
│   ├── flights (via AviationStack cache)
│   ├── airports
│   ├── bookings
│   ├── telemetry
│   └── anomalies
│
├── AI Tables (new)
│   ├── conversation
│   ├── message
│   ├── user_ai_preference
│   ├── rag_document
│   ├── rag_chunk
│   └── ai_execution
```

---

## Table Schemas

### A. Conversations

```sql
CREATE TABLE conversation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500),
    model VARCHAR(100),
    system_prompt TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_conversation_user_id ON conversation(user_id);
CREATE INDEX idx_conversation_updated_at ON conversation(updated_at DESC);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → users(id), conversation owner |
| `title` | VARCHAR(500) | Auto-generated or user-set title |
| `model` | VARCHAR(100) | LLM model used (e.g., `gpt-4o`) |
| `system_prompt` | TEXT | System prompt for this conversation |
| `metadata` | JSONB | Extensible metadata (tags, tags, etc.) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last message timestamp |

---

### B. Messages

```sql
CREATE TABLE message (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    tool_calls JSONB,
    tool_call_id VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    token_count INT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_message_conversation_id ON message(conversation_id);
CREATE INDEX idx_message_created_at ON message(created_at);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `conversation_id` | UUID | FK → conversation(id) |
| `role` | VARCHAR(20) | `user` \| `assistant` \| `system` \| `tool` |
| `content` | TEXT | Message content (text) |
| `tool_calls` | JSONB | Tool calls made by assistant |
| `tool_call_id` | VARCHAR(100) | For tool responses |
| `metadata` | JSONB | Extensible (token counts, citations, etc.) |
| `token_count` | INT | Token count for this message |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

### C. User AI Preferences

```sql
CREATE TABLE user_ai_preference (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preference_key VARCHAR(100) NOT NULL,
    preference_value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, preference_key)
);

CREATE INDEX idx_user_ai_preference_user_id ON user_ai_preference(user_id);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → users(id) |
| `preference_key` | VARCHAR(100) | Key (e.g., `preferred_airline`, `delay_risk_tolerance`) |
| `preference_value` | JSONB | Value (flexible: string, number, object) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Example keys:**
- `preferred_airlines` → `["6E", "AI"]`
- `delay_risk_tolerance` → `"low"`
- `preferred_arrival_time` → `"morning"`
- `max_budget_inr` → `15000`
- `direct_flight_preference` → `true`

---

### D. RAG Documents

```sql
CREATE TABLE rag_document (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    source VARCHAR(200),
    document_type VARCHAR(50) NOT NULL, -- 'manual', 'regulation', 'manual', 'faq', 'weather'
    language VARCHAR(10) DEFAULT 'en',
    checksum VARCHAR(64), -- SHA256 of content for dedup
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rag_document_type ON rag_document(document_type);
CREATE INDEX idx_rag_document_checksum ON rag_document(checksum);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `title` | VARCHAR(500) | Document title |
| `source` | VARCHAR(200) | Source URL or origin |
| `document_type` | VARCHAR(50) | Category: `manual`, `regulation`, `faq`, `weather`, `atc_procedure` |
| `language` | VARCHAR(10) | ISO language code |
| `checksum` | VARCHAR(64) | SHA256 of content for deduplication |
| `metadata` | JSONB | Extensible (tags, version, authority) |

---

### E. RAG Chunks

```sql
CREATE TABLE rag_chunk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES rag_document(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    embedding VECTOR(1536), -- pgvector: 1536 dims for text-embedding-3-small
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rag_chunk_document_id ON rag_chunk(document_id);
-- Vector similarity index (created after pgvector extension)
-- CREATE INDEX idx_rag_chunk_embedding ON rag_chunk USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `document_id` | UUID | FK → rag_document(id) |
| `chunk_index` | INT | Sequential chunk number |
| `content` | TEXT | Chunk text content |
| `metadata` | JSONB | Extensible (page numbers, headings, etc.) |
| `embedding` | VECTOR(1536) | pgvector embedding (text-embedding-3-small = 1536 dims) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

### F. AI Execution Traces

```sql
CREATE TABLE ai_execution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    request_id UUID NOT NULL DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL, -- 'chat', 'recommend', 'atc_explain'
    model VARCHAR(100),
    prompt_tokens INT,
    completion_tokens INT,
    total_tokens INT,
    estimated_cost_usd DECIMAL(10, 6),
    latency_ms INT,
    status VARCHAR(20) NOT NULL, -- 'success', 'error', 'timeout'
    error_message TEXT,
    request_payload JSONB,
    response_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_execution_user_id ON ai_execution(user_id);
CREATE INDEX idx_ai_execution_type ON ai_execution(type);
CREATE INDEX idx_ai_execution_created_at ON ai_execution(created_at DESC);
CREATE INDEX idx_ai_execution_request_id ON ai_execution(request_id);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → users(id), nullable for anonymous |
| `request_id` | UUID | Correlation ID for tracing |
| `type` | VARCHAR(50) | `chat`, `recommend`, `atc_explain` |
| `model` | VARCHAR(100) | LLM model used |
| `prompt_tokens` | INT | Prompt tokens |
| `completion_tokens` | INT | Completion tokens |
| `total_tokens` | INT | Total tokens |
| `estimated_cost_usd` | DECIMAL(10,6) | Estimated USD cost |
| `latency_ms` | INT | End-to-end latency |
| `status` | VARCHAR(20) | `success`, `error`, `timeout` |
| `error_message` | TEXT | Error details if failed |
| `request_payload` | JSONB | Full request (sanitized) |
| `response_payload` | JSONB | Full response (sanitized) |
| `created_at` | TIMESTAMPTZ | Timestamp |

---

## pgvector Setup

```sql
-- Enable pgvector extension (run once)
CREATE EXTENSION IF NOT EXISTS vector;

-- After creating rag_chunk table, create vector index
-- (run after populating some data)
CREATE INDEX ON rag_chunk USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Embedding model**: `text-embedding-3-small` (1536 dimensions, cost-effective)
- Alternative: `text-embedding-3-large` (3072 dims, higher quality)
- Local option: `nomic-embed-text` (768 dims, via Ollama)

---

## Migration Strategy

1. **Phase 1 (AI-0)**: Create `conversation`, `message`, `ai_execution` tables (no RAG yet)
2. **Phase 2 (AI-1)**: Add `rag_document`, `rag_chunk`, enable `pgvector`
3. **Phase 3 (AI-2+)**: Add `user_ai_preference` when personalization needed

---

## Indexes Summary

| Table | Indexes |
|-------|---------|
| `conversation` | `user_id`, `updated_at DESC` |
| `message` | `conversation_id`, `created_at` |
| `user_ai_preference` | `user_id` (unique on `user_id, preference_key`) |
| `rag_document` | `document_type`, `checksum` |
| `rag_chunk` | `document_id`, `embedding` (IVFFlat) |
| `ai_execution` | `user_id`, `type`, `created_at DESC`, `request_id` |

---

## Row Level Security (RLS) — Optional

```sql
-- Enable RLS on sensitive tables
ALTER TABLE conversation ENABLE ROW LEVEL SECURITY;
ALTER TABLE message ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ai_preference ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY conversation_owner ON conversation
    USING (user_id = auth.uid());

CREATE POLICY message_owner ON message
    USING (conversation_id IN (SELECT id FROM conversation WHERE user_id = auth.uid()));
```

> Note: RLS requires Supabase Auth integration. Can be added when Supabase Auth is adopted.

---

*Schema is designed for PostgreSQL 15+ / Supabase with pgvector extension.*