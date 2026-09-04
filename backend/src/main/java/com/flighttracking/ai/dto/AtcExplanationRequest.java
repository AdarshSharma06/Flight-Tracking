package com.flighttracking.ai.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotNull;

import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AtcExplanationRequest(
        @NotNull(message = "Anomaly ID is required")
        Long anomalyId,
        String flightNumber,
        String anomalyType,
        String severity,
        String description,
        String status,
        String detectedAt,
        TelemetryData telemetry,
        WeatherData weather,
        List<String> limitations
) {
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record TelemetryData(
            Long id,
            String flightNumber,
            String originIata,
            String destinationIata,
            Double latitude,
            Double longitude,
            Double altitude,
            Double speed,
            Double direction,
            Double heading,
            String flightStatus,
            String aircraftRegistration,
            String recordedAt
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record WeatherData(
            Double temperature,
            Double windSpeed,
            Double humidity,
            Double precipitation,
            String weatherCondition
    ) {}
}
