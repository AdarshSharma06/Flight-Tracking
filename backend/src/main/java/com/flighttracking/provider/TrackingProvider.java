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
