package com.flighttracking.dto.flight;

public record FlightDto(
        String flightNumber,
        String flightIata,
        String flightIcao,
        String airlineName,
        String airlineIata,
        String airlineIcao,
        String departureAirport,
        String departureIata,
        String departureIcao,
        String departureTerminal,
        String departureGate,
        String departureScheduled,
        String departureEstimated,
        String departureActual,
        String departureDelay,
        String arrivalAirport,
        String arrivalIata,
        String arrivalIcao,
        String arrivalTerminal,
        String arrivalGate,
        String arrivalScheduled,
        String arrivalEstimated,
        String arrivalActual,
        String arrivalDelay,
        String status,
        String aircraftRegistration,
        String aircraftIata,
        String aircraftIcao
) {
}
