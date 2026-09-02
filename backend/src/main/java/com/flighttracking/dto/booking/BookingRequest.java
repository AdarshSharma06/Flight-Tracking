package com.flighttracking.dto.booking;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record BookingRequest(
        @NotBlank(message = "flightNumber is required")
        @Size(max = 20, message = "flightNumber must be at most 20 characters")
        String flightNumber,

        @NotBlank(message = "origin is required")
        @Pattern(regexp = "^[A-Za-z]{3}$", message = "origin must be a 3-letter IATA code")
        String origin,

        @NotBlank(message = "destination is required")
        @Pattern(regexp = "^[A-Za-z]{3}$", message = "destination must be a 3-letter IATA code")
        String destination,

        @Size(max = 50, message = "departureScheduled too long")
        String departureScheduled,
        @Size(max = 50, message = "arrivalScheduled too long")
        String arrivalScheduled,
        @Size(max = 100, message = "airlineName must be at most 100 characters")
        String airlineName,
        @Size(max = 50, message = "aircraftRegistration must be at most 50 characters")
        String aircraftRegistration
) {
}
