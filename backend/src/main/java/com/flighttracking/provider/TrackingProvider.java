package com.flighttracking.provider;

import java.util.Optional;

/**
 * Provider interface for live ADS-B telemetry data.
 * Implementations provide real-time aircraft position, velocity, heading, etc.
 */
public interface TrackingProvider {

    /**
     * Get live tracking data for an aircraft identified by ICAO24 address.
     */
    Optional<LiveTrackingData> getByIcao24(String icao24);

    /**
     * Get live tracking data for an aircraft identified by callsign.
     */
    Optional<LiveTrackingData> getByCallsign(String callsign);

    /**
     * Get live tracking data for a flight identified by IATA flight number.
     * Used by AirLabs provider (primary live lookup: /api/v9/flight?flight_iata=...).
     */
    default Optional<LiveTrackingData> getByFlightIata(String flightIata) {
        return Optional.empty();
    }

    String getProviderName();

    record LiveTrackingData(
            String icao24,
            String callsign,
            String originCountry,
            Double longitude,
            Double latitude,
            Double baroAltitude,
            Double geoAltitude,
            Double velocity,
            Double trueTrack,
            Double verticalRate,
            String squawk,
            Boolean onGround,
            Long lastContact
    ) {}
}
