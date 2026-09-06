package com.flighttracking.provider;

import com.flighttracking.client.AirlabsClient;
import com.flighttracking.client.AirlabsClient.AirlabsFlight;
import com.flighttracking.util.FlightNumberUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * AirLabs live telemetry provider.
 * Single lookup: flight_iata -> live position. No polling, no background jobs.
 */
@Component
@Primary
public class AirlabsTrackingProvider implements TrackingProvider {

    private static final Logger log = LoggerFactory.getLogger(AirlabsTrackingProvider.class);

    private final AirlabsClient client;

    public AirlabsTrackingProvider(AirlabsClient client) {
        this.client = client;
    }

    @Override
    public Optional<LiveTrackingData> getByIcao24(String icao24) {
        if (icao24 == null || icao24.isBlank()) return Optional.empty();
        String normalized = icao24.trim().toLowerCase();
        if (normalized.isBlank()) return Optional.empty();
        try {
            AirlabsFlight flight = client.getFlightByHex(normalized);
            if (flight == null) return Optional.empty();
            return Optional.of(mapToLiveData(flight));
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            if (msg.contains("429")) {
                log.warn("AirLabs live tracking unavailable for hex {}: HTTP 429", normalized);
            } else if (msg.contains("401") || msg.contains("403")) {
                log.warn("AirLabs live tracking unavailable for hex {}: HTTP {}", normalized, msg.contains("401") ? 401 : 403);
            } else {
                log.warn("AirLabs live tracking unavailable for hex {}: {}", normalized, e.getClass().getSimpleName());
            }
            return Optional.empty();
        }
    }

    @Override
    public Optional<LiveTrackingData> getByCallsign(String callsign) {
        if (callsign == null || callsign.isBlank()) return Optional.empty();
        String normalized = callsign.trim().toUpperCase();
        if (normalized.isBlank()) return Optional.empty();
        try {
            AirlabsFlight flight = client.getFlightByFlightIcao(normalized);
            if (flight == null) return Optional.empty();
            return Optional.of(mapToLiveData(flight));
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            if (msg.contains("429")) {
                log.warn("AirLabs live tracking unavailable for callsign {}: HTTP 429", normalized);
            } else if (msg.contains("401") || msg.contains("403")) {
                log.warn("AirLabs live tracking unavailable for callsign {}: HTTP {}", normalized, msg.contains("401") ? 401 : 403);
            } else {
                log.warn("AirLabs live tracking unavailable for callsign {}: {}", normalized, e.getClass().getSimpleName());
            }
            return Optional.empty();
        }
    }

    @Override
    public Optional<LiveTrackingData> getByRegistration(String regNumber) {
        if (regNumber == null || regNumber.isBlank()) return Optional.empty();
        String normalized = regNumber.trim().toUpperCase();
        if (normalized.isBlank()) return Optional.empty();
        try {
            AirlabsFlight flight = client.getFlightByRegNumber(normalized);
            if (flight == null) return Optional.empty();
            return Optional.of(mapToLiveData(flight));
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            if (msg.contains("429")) {
                log.warn("AirLabs live tracking unavailable for registration {}: HTTP 429", normalized);
            } else if (msg.contains("401") || msg.contains("403")) {
                log.warn("AirLabs live tracking unavailable for registration {}: HTTP {}", normalized, msg.contains("401") ? 401 : 403);
            } else {
                log.warn("AirLabs live tracking unavailable for registration {}: {}", normalized, e.getClass().getSimpleName());
            }
            return Optional.empty();
        }
    }

    @Override
    public Optional<LiveTrackingData> getByHex(String hex) {
        return getByIcao24(hex);
    }

    @Override
    public Optional<LiveTrackingData> getByFlightIata(String flightIata) {
        if (flightIata == null || flightIata.isBlank()) return Optional.empty();
        String normalized = FlightNumberUtils.normalize(flightIata);
        if (normalized == null || normalized.isBlank()) return Optional.empty();
        try {
            AirlabsFlight flight = client.getFlightByIata(normalized);
            if (flight == null) return Optional.empty();
            // If AirLabs returns no coordinates, treat as unavailable (graceful null)
            // Still map to allow status/alternate fields if needed, but lat/lng null means no live position
            return Optional.of(mapToLiveData(flight));
        } catch (Exception e) {
            // Classify safely without leaking key; log warn with status if available
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            // Do not log api_key
            if (msg.contains("429")) {
                log.warn("AirLabs live tracking unavailable for flight {}: HTTP 429", normalized);
            } else if (msg.contains("401") || msg.contains("403")) {
                log.warn("AirLabs live tracking unavailable for flight {}: HTTP {}", normalized, msg.contains("401") ? 401 : 403);
            } else if (msg.toLowerCase().contains("timed out") || msg.toLowerCase().contains("timeout")) {
                log.warn("AirLabs live tracking unavailable for flight {}: TIMEOUT", normalized);
            } else {
                log.warn("AirLabs live tracking unavailable for flight {}: {}", normalized, e.getClass().getSimpleName());
            }
            return Optional.empty();
        }
    }

    private LiveTrackingData mapToLiveData(AirlabsFlight f) {
        Double lat = f.lat();
        Double lng = f.lng();
        // Validate coordinates per spec: both present and within ranges, else both null
        if (!isValidCoordinate(lat, lng)) {
            lat = null;
            lng = null;
        }
        Double alt = f.alt();
        Double speed = f.speed();
        Double vSpeed = f.vSpeed();
        Double dir = f.dir();
        Long updated = f.updated();
        Boolean onGround = mapOnGround(f.status());
        // AirLabs fields: alt is typically feet, speed may be knots or km/h — preserve as-is per existing conventions
        // Map lat/lng correctly: lng -> longitude, lat -> latitude
        // Documented mapping in code: lat->latitude, lng->longitude, alt->altitude, speed->speed, v_speed->speedVertical, dir->direction, updated->liveUpdated
        return new LiveTrackingData(
                f.hex(),
                f.flightIcao(),
                null,
                lng,
                lat,
                alt,
                alt, // geoAltitude same as baro for AirLabs; no distinction
                speed,
                dir,
                vSpeed,
                null,
                onGround,
                updated
        );
    }

    private boolean isValidCoordinate(Double lat, Double lng) {
        if (lat == null || lng == null) return false;
        if (lat < -90.0 || lat > 90.0) return false;
        if (lng < -180.0 || lng > 180.0) return false;
        return true;
    }

    /**
     * Safe isGround mapping from AirLabs status.
     * AirLabs status examples: "en-route", "en_route", "airborne", "landed", "scheduled", "cancelled", "diverted".
     * If status clearly airborne -> false; if clearly ground-terminal -> true only when reliable; else null.
     * Do not invent.
     */
    static Boolean mapOnGround(String status) {
        if (status == null || status.isBlank()) return null;
        String s = status.trim().toLowerCase();
        // Airborne indicators
        if (s.equals("en-route") || s.equals("en_route") || s.equals("enroute") || s.equals("airborne") || s.equals("active") || s.equals("in_air")) {
            return false;
        }
        // Ground-terminal reliable indicators
        if (s.equals("landed") || s.equals("arrived")) {
            return true;
        }
        // scheduled/cancelled/diverted/delayed are not reliable ground truth -> null
        return null;
    }

    @Override
    public String getProviderName() {
        return "AirLabs";
    }
}
