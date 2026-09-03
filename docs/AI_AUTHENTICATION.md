# AI Authentication Design — Flight Tracking

## Principle

**Spring Boot remains the sole authentication authority.**

FastAPI does not authenticate users. It trusts Spring Boot to authenticate and authorize requests.

---

## Architecture

```
┌─────────────┐      JWT       ┌─────────────┐      X-AI-Service-Key      ┌────────────────┐
│   React     │ ─────────────> │ Spring Boot │ ──────────────────────────> │  FastAPI       │
│  (Frontend)  │  (JWT in     │  (AuthZ)    │  (shared secret, env)      │  (AI Service)  │
│             │   Authorization│             │                            │                │
│             │   header)      │             │                            │                │
└─────────────┘                └─────────────┘                            └────────────────┘
```

---

## Flow

### 1. User Login (Existing)
```
POST /api/auth/login
→ Spring Boot validates credentials
→ Returns JWT (access token)
→ Frontend stores JWT in localStorage
```

### 2. AI Request (Future)
```
User asks: "What's the status of 6E6892?"

Frontend:
  1. Adds JWT to Authorization header
  2. POST /api/ai/chat { message, conversationId }

Spring Boot (AiController):
  1. Validates JWT (Spring Security filter)
  2. Extracts userId, roles from JWT
  3. Validates user has access to AI features
  4. Calls AiServiceClient.post("/api/ai/chat", body, userId)
     - Adds X-AI-Service-Key header (shared secret)
     - Adds X-User-Id header (from JWT)
  4. Returns AI response to frontend
```

### 3. FastAPI Receives Request
```
FastAPI receives:
  - Headers: X-AI-Service-Key, X-User-Id
  - Body: { message, conversationId, userId }

FastAPI validates:
  1. X-AI-Service-Key matches AI_SERVICE_API_KEY env
  2. X-User-Id present (for audit/logging)
  3. Processes request
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **No JWT in FastAPI** | Spring Boot is auth authority; FastAPI trusts Spring Boot |
| **Shared secret (X-AI-Service-Key)** | Simple, secure service-to-service auth; rotated via env |
| **X-User-Id header** | Passes user identity for audit/logging; not for auth |
| **No JWT parsing in Python** | Avoids duplicating JWT logic, keeps secrets in Java |
| **Spring Boot authorizes** | Role checks (USER, ATC_EMPLOYEE) happen in Spring Boot |

---

## Environment Variables

### Backend (Spring Boot)
```yaml
app:
  ai:
    base-url: ${AI_SERVICE_BASE_URL:http://localhost:8001}
    timeout-ms: ${AI_SERVICE_TIMEOUT_MS:5000}
    api-key: ${AI_SERVICE_API_KEY:}  # Shared secret for FastAPI
```

### AI Service (FastAPI)
```env
AI_SERVICE_API_KEY=  # Must match Spring Boot's api-key
SPRING_BOOT_BASE_URL=http://localhost:8080
```

---

## Security Considerations

| Threat | Mitigation |
|--------|------------|
| **Replay attacks** | AI service logs request IDs; Spring Boot generates unique request IDs |
| **Man-in-the-middle** | TLS enforced in production (Render + Vercel) |
| **Key rotation** | Rotate `AI_SERVICE_API_KEY` via Render env vars; zero-downtime via blue-green |
| **Impersonation** | FastAPI only trusts `X-User-Id` from trusted Spring Boot (validated via shared secret) |
| **Data leakage** | FastAPI never logs JWTs, API keys, or full request bodies |

---

## What NOT to Do

| ❌ Don't | ✅ Do |
|----------|-------|
| Parse JWT in FastAPI | Trust `X-User-Id` from Spring Boot |
| Store JWT secrets in Python | Keep secrets in Spring Boot env only |
| Implement login in FastAPI | Delegate auth to Spring Boot |
| Expose FastAPI directly to browser | Route all AI traffic through Spring Boot |
| Pass JWT to FastAPI | Use `X-User-Id` header |

---

## Future: When to Evolve

| Trigger | Evolution |
|---------|-----------|
| Multi-region AI deployment | Add mTLS between Spring Boot and FastAPI |
| High throughput | Add async message queue (Redis/RabbitMQ) between services |
| Multi-tenant | Add tenant ID to headers |
| Audit requirements | Add signed request payloads (JWS) |

---

*Authentication design ensures Spring Boot remains the single source of truth for identity while enabling secure, auditable AI service communication.*