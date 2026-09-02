package com.flighttracking.dto.anomaly;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record AnomalyRequest(
        @NotBlank(message = "flightNumber is required")
        @Size(max = 20, message = "flightNumber must be at most 20 characters")
        String flightNumber,

        @Size(max = 20, message = "flightIata must be at most 20 characters")
        String flightIata,

        @NotBlank(message = "anomalyType is required")
        @Size(max = 50, message = "anomalyType must be at most 50 characters")
        @Pattern(regexp = "^[A-Za-z0-9_\\-]+$", message = "anomalyType must be alphanumeric with _ or -")
        String anomalyType,

        @NotBlank(message = "severity is required")
        @Pattern(regexp = "^(?i)(LOW|MEDIUM|HIGH|CRITICAL)$", message = "severity must be one of LOW, MEDIUM, HIGH, CRITICAL")
        String severity,

        @Size(max = 1000, message = "description must be at most 1000 characters")
        String description,

        @Pattern(regexp = "^(?i)(OPEN|INVESTIGATING|RESOLVED|FALSE_POSITIVE)?$", message = "status must be one of OPEN, INVESTIGATING, RESOLVED, FALSE_POSITIVE")
        String status,

        Long telemetryId
) {
}
