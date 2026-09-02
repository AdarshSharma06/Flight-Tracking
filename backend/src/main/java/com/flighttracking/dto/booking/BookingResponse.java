package com.flighttracking.dto.booking;

import java.time.Instant;

public record BookingResponse(
        Long id,
        Long userId,
        String username,
        String flightNumber,
        String origin,
        String destination,
        String departureScheduled,
        String arrivalScheduled,
        String airlineName,
        String aircraftRegistration,
        String status,
        Instant createdAt
) {
}
