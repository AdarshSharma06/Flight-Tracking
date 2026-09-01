package com.flighttracking.dto.airport;

public record AirportDto(
        String iata,
        String icao,
        String name,
        String city,
        String country,
        Double latitude,
        Double longitude,
        String timezone,
        String countryIso2
) {
}
