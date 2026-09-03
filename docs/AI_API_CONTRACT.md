# AI API Contracts — Flight Tracking

This document defines the **planned** API contracts between Spring Boot and the FastAPI AI Service.
These are **contracts only** — not implemented in AI-0.

---

## Overview

```
Spring Boot (Backend)          FastAPI (AI Service)
     │                              │
     │  POST /api/ai/chat           │
     │────────────────────────────>│
     │                              │
     │<────────────────────────────│
     │                              │
```

**Base URL**: `http://localhost:8001` (local) / `AI_SERVICE_BASE_URL` (env)

**Authentication**: Spring Boot → FastAPI via `X-AI-Service-Key` header (shared secret)

---

## 1. POST /api/ai/chat

**Conversational AI Aviation Assistant**

### Request

```json
{
  "message": "What's the status of flight 6E6892?",
  "conversationId": "conv-123",
  "userId": "user-456"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes | User's natural language query |
| `conversationId` | string | Yes | UUID for conversation continuity |
| `userId` | string | Yes | Authenticated user ID (from JWT) |

### Response (200)

```json
{
  "answer": "Flight 6E6892 (IndiGo) is currently SCHEDULED. Scheduled departure from MAA at 10:55 UTC, arriving BLR at 12:20 UTC. Aircraft: A320neo (VT-XXX).",
  "conversationId": "conv-123",
  "sources": [
    {"type": "flight_status", "flightNumber": "6E6892", "source": "AviationStack"}
  ],
  "toolsUsed": ["searchFlights", "getFlightTracking"],
  "metadata": {
    "model": "gpt-4o",
    "latencyMs": 1240,
    "tokenUsage": {"prompt": 156, "completion": 89}
  }
}
```

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `INVALID_REQUEST` | Missing required fields |
| 401 | `UNAUTHORIZED` | Invalid/missing AI service key |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `AI_SERVICE_ERROR` | Internal AI error |
| 503 | `SERVICE_UNAVAILABLE` | LLM provider down |

---

## 2. POST /api/ai/recommend

**AI Flight Recommendation**

### Request

```json
{
  "origin": "DEL",
  "destination": "BLR",
  "date": "2026-09-15",
  "budget": 15000,
  "preferences": {
    "directFlight": true,
    "preferredArrivalTime": "morning",
    "delayRiskTolerance": "low",
    "preferredAirlines": ["6E", "AI"]
  },
  "userId": "user-456"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `origin` | string | Yes | IATA code (3 letters) |
| `destination` | string | Yes | IATA code (3 letters) |
| `date` | string (date) | Yes | YYYY-MM-DD |
| `budget` | number | Optional | Max price in INR |
| `preferences.directFlight` | boolean | Optional | Default: true |
| `preferences.preferredArrivalTime` | string | Optional | "morning" \| "afternoon" \| "evening" \| "night" |
| `preferences.delayRiskTolerance` | string | Optional | "low" \| "medium" \| "high" |
| `preferences.preferredAirlines` | string[] | Optional | Airline IATA codes |
| `userId` | string | Yes | Authenticated user ID |

### Response (200)

```json
{
  "recommendations": [
    {
      "flight": {
        "flightNumber": "6E6892",
        "airline": "IndiGo",
        "origin": "DEL",
        "destination": "BLR",
        "departureTime": "2026-09-15T10:55:00Z",
        "arrivalTime": "2026-09-15T12:20:00Z",
        "price": 12500,
        "durationMinutes": 165,
        "isDirect": true
      },
      "score": 0.92,
      "reasoning": "Direct flight, morning arrival, low delay risk (IndiGo on-time 87%), within budget",
      "confidence": 0.88
    },
    {
      "flight": {
        "flightNumber": "AI501",
        "airline": "Air India",
        "origin": "DEL",
        "destination": "BLR",
        "departureTime": "2026-09-15T08:30:00Z",
        "arrivalTime": "2026-09-15T10:55:00Z",
        "price": 13800,
        "durationMinutes": 145,
        "isDirect": true
      },
      "score": 0.85,
      "reasoning": "Earlier departure, slightly higher price, good on-time record",
      "confidence": 0.82
    }
  ],
  "metadata": {
    "searchedAt": "2026-09-03T10:30:00Z",
    "totalOptionsConsidered": 12,
    "model": "gpt-4o",
    "latencyMs": 2100
  }
}
```

---

## 3. POST /api/ai/atc/explain

**AI ATC Anomaly Explanation**

### Request

```json
{
  "anomalyId": 12345,
  "flightNumber": "6E6892",
  "anomaly": {
    "type": "ALTITUDE_DEVIATION",
    "severity": "HIGH",
    "description": "Flight deviated 1200ft below assigned altitude",
    "detectedAt": "2026-09-03T10:15:00Z",
    "telemetry": {
      "latitude": 12.9716,
      "longitude": 77.5946,
      "altitude": 32800,
      "assignedAltitude": 34000,
      "speed": 450,
      "heading": 180
    }
  },
  "flightContext": {
    "flightNumber": "6E6892",
    "airline": "IndiGo",
    "origin": "DEL",
    "destination": "BLR",
    "aircraft": "A320neo (VT-IXA)"
  },
  "weather": {
    "temperature": -45,
    "windSpeed": 45,
    "windDirection": 270,
    "turbulence": "moderate",
    "condition": "clear"
  },
  "userId": "atc-user-789"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `anomalyId` | number | Yes | Anomaly record ID |
| `flightNumber` | string | Yes | Flight IATA number |
| `anomaly.type` | string | Yes | `ALTITUDE_DEVIATION` \| `SPEED_DEVIATION` \| `ROUTE_DEVIATION` \| `LOST_CONTACT` \| `UNEXPECTED_MANEUVER` |
| `anomaly.severity` | string | Yes | `LOW` \| `MEDIUM` \| `HIGH` \| `CRITICAL` |
| `anomaly.description` | string | Yes | Human-readable description |
| `anomaly.detectedAt` | string (ISO8601) | Yes | Detection timestamp |
| `anomaly.telemetry` | object | Yes | Telemetry snapshot at detection |
| `flightContext` | object | Yes | Flight metadata |
| `weather` | object | Optional | Weather at anomaly location |
| `userId` | string | Yes | Authenticated ATC user ID |

### Response (200)

```json
{
  "explanation": "Flight 6E6892 (IndiGo A320neo VT-IXA) experienced an altitude deviation of 1,200 ft below the assigned FL340 at 10:15 UTC. The aircraft was at FL328 over position 12.97°N, 77.59°E. Contributing factors: moderate clear-air turbulence reported in the area (wind shear 45 kts at 270°). The A320neo's autopilot may have over-corrected for a thermal updraft. Recommended action: query crew for confirmation, monitor for recurring deviation, consider altitude reassignment to FL330 if turbulence persists. No immediate safety concern if deviation was transient.",
  "anomalyId": 12345,
  "severity": "HIGH",
  "confidence": 0.87,
  "recommendedActions": [
    "Contact crew for altitude awareness confirmation",
    "Monitor for recurring deviation over next 10 minutes",
    "Consider temporary altitude reassignment to FL330"
  ],
  "metadata": {
    "model": "gpt-4o",
    "latencyMs": 1850,
    "tokensUsed": {"prompt": 890, "completion": 320}
  }
}
```

---

## Error Response Format (All Endpoints)

```json
{
  "error": "AI_SERVICE_ERROR",
  "message": "Human-readable error description",
  "requestId": "req-uuid-1234",
  "details": {}
}
```

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | `INVALID_REQUEST` | Validation failed |
| 401 | `UNAUTHORIZED` | Invalid/missing API key |
| 422 | `VALIDATION_ERROR` | Request body invalid |
| 429 | `RATE_LIMITED` | Rate limit exceeded |
| 500 | `AI_SERVICE_ERROR` | Internal error |
| 503 | `SERVICE_UNAVAILABLE` | LLM provider down |
| 504 | `TIMEOUT` | Request timeout |

---

## Versioning

- **v1** (current): Initial contracts
- Future versions: `/api/v2/ai/...` with backward compatibility

---

*These are contracts only. Implementation deferred to AI-1+.*