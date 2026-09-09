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
        Instant createdAt,
        String ignavId,
        Double priceAmount,
        String priceCurrency,
        String priceStatus,
        String providerName,
        String providerType,
        String bookingUrl,
        String cabin,
        String duration,
        Integer stops
) {
    // Backward-compatible constructor (12 args) delegates to full
    public BookingResponse(Long id, Long userId, String username, String flightNumber, String origin,
                           String destination, String departureScheduled, String arrivalScheduled,
                           String airlineName, String aircraftRegistration, String status, Instant createdAt) {
        this(id, userId, username, flightNumber, origin, destination, departureScheduled, arrivalScheduled,
                airlineName, aircraftRegistration, status, createdAt,
                null, null, null, null, null, null, null, null, null, null);
    }
}
