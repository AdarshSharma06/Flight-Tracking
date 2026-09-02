package com.flighttracking.dto.anomaly;

import java.time.Instant;

public record AnomalyResponse(
        Long id,
        String flightNumber,
        String flightIata,
        String anomalyType,
        String severity,
        String description,
        String status,
        Long telemetryId,
        Instant detectedAt,
        Instant resolvedAt,
        Instant createdAt,
        Instant updatedAt
) {
}
