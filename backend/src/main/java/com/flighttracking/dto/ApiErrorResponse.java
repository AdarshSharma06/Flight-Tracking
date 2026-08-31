package com.flighttracking.dto;

import java.time.Instant;
import java.util.List;

/**
 * Standardized error response used by {@link com.flighttracking.exception.GlobalExceptionHandler}.
 */
public record ApiErrorResponse(
        Instant timestamp,
        int status,
        String error,
        String message,
        String path,
        List<String> details
) {
}
