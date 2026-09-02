package com.flighttracking.dto.telemetry;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record TelemetryRequest(
        @NotBlank(message = "flightNumber is required")
        @Size(max = 20, message = "flightNumber must be at most 20 characters")
        String flightNumber,

        @Size(max = 20, message = "flightIata must be at most 20 characters")
        String flightIata,
        @Size(max = 20, message = "flightIcao must be at most 20 characters")
        String flightIcao,
        @Size(max = 10, message = "airlineIata must be at most 10 characters")
        String airlineIata,
        @Pattern(regexp = "^[A-Za-z]{3}$", message = "originIata must be a 3-letter IATA code")
        String originIata,
        @Pattern(regexp = "^[A-Za-z]{3}$", message = "destinationIata must be a 3-letter IATA code")
        String destinationIata,
        @DecimalMin(value = "-90.0", message = "latitude must be >= -90")
        @DecimalMax(value = "90.0", message = "latitude must be <= 90")
        Double latitude,
        @DecimalMin(value = "-180.0", message = "longitude must be >= -180")
        @DecimalMax(value = "180.0", message = "longitude must be <= 180")
        Double longitude,
        Double altitude,
        Double speed,
        @DecimalMin(value = "0.0", message = "direction must be >= 0")
        @DecimalMax(value = "360.0", message = "direction must be <= 360")
        Double direction,
        @DecimalMin(value = "0.0", message = "heading must be >= 0")
        @DecimalMax(value = "360.0", message = "heading must be <= 360")
        Double heading,
        @Size(max = 30, message = "flightStatus must be at most 30 characters")
        String flightStatus,
        @Size(max = 500, message = "routeInfo must be at most 500 characters")
        String routeInfo,
        @Size(max = 50, message = "aircraftRegistration must be at most 50 characters")
        String aircraftRegistration
) {
}
