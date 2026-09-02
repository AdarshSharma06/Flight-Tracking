package com.flighttracking.dto.telemetry;

import java.time.Instant;

public record TelemetryResponse(
        Long id,
        String flightNumber,
        String flightIata,
        String flightIcao,
        String airlineIata,
        String originIata,
        String destinationIata,
        Double latitude,
        Double longitude,
        Double altitude,
        Double speed,
        Double direction,
        Double heading,
        String flightStatus,
        String routeInfo,
        String aircraftRegistration,
        Instant recordedAt,
        Instant createdAt
) {
}
