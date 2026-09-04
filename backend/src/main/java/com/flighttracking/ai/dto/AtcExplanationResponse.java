package com.flighttracking.ai.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AtcExplanationResponse(
        String explanation,
        Long anomalyId,
        String flightNumber,
        List<String> facts,
        List<String> context,
        List<String> limitations
) {
}
