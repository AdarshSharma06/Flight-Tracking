package com.flighttracking.dto.flight;

public record FlightTrackingDto(
        // flight identity
        String flightNumber,
        String flightIata,
        String flightIcao,
        String flightDate,
        String status,
        // airline
        String airlineName,
        String airlineIata,
        String airlineIcao,
        // aircraft
        String aircraftRegistration,
        String aircraftIata,
        String aircraftIcao,
        // origin/destination
        String departureAirport,
        String departureIata,
        String departureIcao,
        String departureTerminal,
        String departureGate,
        String departureScheduled,
        String departureEstimated,
        String departureActual,
        String arrivalAirport,
        String arrivalIata,
        String arrivalIcao,
        String arrivalTerminal,
        String arrivalGate,
        String arrivalScheduled,
        String arrivalEstimated,
        String arrivalActual,
        // route
        String route,
        // position / telemetry where available
        Double latitude,
        Double longitude,
        Double altitude,
        Double speed,
        Double speedVertical,
        Double direction,
        Boolean isGround,
        String liveUpdated,
        // timestamps
        String departureDelay,
        String arrivalDelay
) {
}
