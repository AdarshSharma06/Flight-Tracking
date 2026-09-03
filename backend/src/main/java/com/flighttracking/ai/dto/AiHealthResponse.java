package com.flighttracking.ai.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record AiHealthResponse(
        String status,
        String service
) {
}