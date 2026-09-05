package com.flighttracking.ai.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record RecommendationRequest(
        @NotBlank(message = "Query is required")
        @Size(max = 4000, message = "Query must not exceed 4000 characters")
        String query
) {
}
