package com.flighttracking.dto.ignav;

import jakarta.validation.constraints.*;

public record IgnavSearchRequest(
        @NotBlank @Pattern(regexp = "^[A-Za-z]{3}$", message = "origin must be 3-letter IATA") String origin,
        @NotBlank @Pattern(regexp = "^[A-Za-z]{3}$", message = "destination must be 3-letter IATA") String destination,
        @NotBlank String departureDate,
        String returnDate,
        @Min(1) @Max(9) Integer adults,
        String cabin, // economy, premium_economy, business, first
        Integer maxStops, // null = any
        String market, // e.g. IN
        String tripType // ONE_WAY or ROUND_TRIP
) {
}
