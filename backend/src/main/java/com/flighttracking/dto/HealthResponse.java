package com.flighttracking.dto;

import java.time.Instant;

/**
 * DTO for {@code GET /api/health}.
 * Demonstrates the convention that controllers return DTOs, never JPA entities.
 */
public record HealthResponse(
        String status,
        String application,
        Instant timestamp
) {
}
