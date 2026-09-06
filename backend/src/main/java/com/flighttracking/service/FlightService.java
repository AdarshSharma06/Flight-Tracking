package com.flighttracking.service;

import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.dto.flight.FlightSearchResponse;
import com.flighttracking.dto.flight.FlightTrackingDto;
import com.flighttracking.exception.ResourceNotFoundException;
import com.flighttracking.provider.FlightProvider;
import com.flighttracking.provider.TrackingProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service
public class FlightService {

    private static final Logger log = LoggerFactory.getLogger(FlightService.class);

    private final FlightProvider flightProvider;
    private final TrackingProvider trackingProvider;

    public FlightService(FlightProvider flightProvider, TrackingProvider trackingProvider) {
        this.flightProvider = flightProvider;
        this.trackingProvider = trackingProvider;
    }

    public FlightSearchResponse search(String flightIata, String depIata, String arrIata,
                                       String airlineIata, String flightStatus, Integer limit) {
        return searchWithSort(flightIata, depIata, arrIata, airlineIata, flightStatus, limit, null, null);
    }

    public FlightSearchResponse searchWithSort(String flightIata, String depIata, String arrIata,
                                               String airlineIata, String flightStatus, Integer limit,
                                               String sortBy, String order) {
        validateIataIfPresent(depIata, "dep_iata");
        validateIataIfPresent(arrIata, "arr_iata");
        if (limit != null && (limit < 1 || limit > 100)) {
            throw new IllegalArgumentException("limit must be between 1 and 100");
        }
        FlightSearchResponse response = flightProvider.searchFlights(
                flightIata, depIata, arrIata, airlineIata, flightStatus, limit
        );
        List<FlightDto> flights = response.flights();

        if (sortBy != null && !sortBy.isBlank()) {
            Comparator<FlightDto> comparator = comparatorFor(sortBy);
            if (comparator != null) {
                if ("desc".equalsIgnoreCase(order)) {
                    comparator = comparator.reversed();
                }
                flights = flights.stream().sorted(comparator).toList();
            }
        }

        return new FlightSearchResponse(flights, flights.size());
    }

    private Comparator<FlightDto> comparatorFor(String sortBy) {
        return switch (sortBy.toLowerCase()) {
            case "flight_number", "flightnumber", "flight_iata" -> Comparator.comparing(FlightDto::flightIata, Comparator.nullsLast(String::compareToIgnoreCase));
            case "departure_time", "departure", "departure_scheduled" -> Comparator.comparing(FlightDto::departureScheduled, Comparator.nullsLast(String::compareTo));
            case "arrival_time", "arrival", "arrival_scheduled" -> Comparator.comparing(FlightDto::arrivalScheduled, Comparator.nullsLast(String::compareTo));
            case "status" -> Comparator.comparing(FlightDto::status, Comparator.nullsLast(String::compareToIgnoreCase));
            default -> null;
        };
    }

    public FlightDto getByFlightNumber(String flightNumber) {
        if (flightNumber == null || flightNumber.isBlank()) {
            throw new IllegalArgumentException("flightNumber must not be blank");
        }
        String normalized = flightNumber.trim().toUpperCase();
        return flightProvider.getFlightByNumber(normalized);
    }

    public FlightTrackingDto getTracking(String flightNumber) {
        if (flightNumber == null || flightNumber.isBlank()) {
            throw new IllegalArgumentException("flightNumber must not be blank");
        }
        String normalized = flightNumber.trim().toUpperCase();

        // Get commercial flight data from AeroDataBox
        FlightTrackingDto commercial = flightProvider.getFlightTracking(normalized);

        // Attempt to enrich with live ADS-B telemetry from OpenSky
        Optional<TrackingProvider.LiveTrackingData> liveData = resolveLiveData(commercial);

        if (liveData.isEmpty()) {
            return commercial;
        }

        // Merge: commercial identity + live telemetry
        return mergeTracking(commercial, liveData.get());
    }

    private Optional<TrackingProvider.LiveTrackingData> resolveLiveData(FlightTrackingDto commercial) {
        String flight = commercial.flightNumber();
        String aircraftIcao = commercial.aircraftIcao();
        String flightIcao = commercial.flightIcao();
        boolean hasAircraftIcao = aircraftIcao != null && !aircraftIcao.isBlank();
        boolean hasFlightIcao = flightIcao != null && !flightIcao.isBlank();
        log.info("LIVE_DIAG flight={} aircraftIcao={} flightIcao={} hasAircraftIcao={} hasFlightIcao={}", flight, aircraftIcao, flightIcao, hasAircraftIcao, hasFlightIcao);
        try {
            // 1. ICAO24 / Mode-S hex — most reliable, direct OpenSky key
            if (hasAircraftIcao) {
                String id = aircraftIcao.trim();
                log.info("LIVE_DIAG flight={} attempting_open_sky_lookup=icao24 identifier={}", flight, id);
                Optional<TrackingProvider.LiveTrackingData> data = trackingProvider.getByIcao24(id);
                if (data.isPresent()) {
                    TrackingProvider.LiveTrackingData d = data.get();
                    log.info("LIVE_DIAG flight={} opensky_icao24_success latitude={} longitude={} altitude={} velocity={} track={} onGround={}", flight, d.latitude(), d.longitude(), d.baroAltitude(), d.velocity(), d.trueTrack(), d.onGround());
                    log.info("LIVE_DIAG flight={} live_data_obtained source=icao24 latitude={} longitude={}", flight, d.latitude(), d.longitude());
                    return data;
                } else {
                    log.info("LIVE_DIAG flight={} opensky_icao24_empty identifier={}", flight, id);
                }
            } else {
                log.info("LIVE_DIAG flight={} skipping_icao24_lookup reason=aircraftIcao_missing_or_blank", flight);
            }

            // 2. ICAO callsign (e.g., IGO123) — may match OpenSky callsign field
            if (hasFlightIcao) {
                String id = flightIcao.trim();
                log.info("LIVE_DIAG flight={} attempting_open_sky_lookup=callsign identifier={}", flight, id);
                Optional<TrackingProvider.LiveTrackingData> data = trackingProvider.getByCallsign(id);
                if (data.isPresent()) {
                    TrackingProvider.LiveTrackingData d = data.get();
                    log.info("LIVE_DIAG flight={} opensky_callsign_success latitude={} longitude={} altitude={} velocity={} track={} onGround={}", flight, d.latitude(), d.longitude(), d.baroAltitude(), d.velocity(), d.trueTrack(), d.onGround());
                    log.info("LIVE_DIAG flight={} live_data_obtained source=callsign latitude={} longitude={}", flight, d.latitude(), d.longitude());
                    return data;
                } else {
                    log.info("LIVE_DIAG flight={} opensky_callsign_empty identifier={}", flight, id);
                }
            } else {
                log.info("LIVE_DIAG flight={} skipping_callsign_lookup reason=flightIcao_missing_or_blank", flight);
            }
        } catch (Exception e) {
            log.warn("LIVE_DIAG flight={} live_data_unavailable reason=exception type={} message={}", flight, e.getClass().getSimpleName(), e.getMessage());
            log.warn("Live telemetry enrichment failed for flight {}: {}", flight, e.getMessage());
        }

        // Do NOT use flightIata (IATA number, e.g. 6E123) as an OpenSky callsign.
        // OpenSky callsigns are ICAO-format (e.g., IGO123), not IATA.

        String reason = (!hasAircraftIcao && !hasFlightIcao) ? "both_identifiers_missing" : "both_lookups_empty_or_failed";
        log.info("LIVE_DIAG flight={} live_data_unavailable reason={}", flight, reason);
        return Optional.empty();
    }

    private FlightTrackingDto mergeTracking(FlightTrackingDto commercial, TrackingProvider.LiveTrackingData live) {
        // Only overwrite null commercial fields with live data
        // Do NOT overwrite valid commercial data with null OpenSky data
        return new FlightTrackingDto(
                commercial.flightNumber(),
                commercial.flightIata(),
                commercial.flightIcao(),
                commercial.flightDate(),
                commercial.status(),
                commercial.airlineName(),
                commercial.airlineIata(),
                commercial.airlineIcao(),
                commercial.aircraftRegistration(),
                commercial.aircraftIata(),
                commercial.aircraftIcao(),
                commercial.departureAirport(),
                commercial.departureIata(),
                commercial.departureIcao(),
                commercial.departureTerminal(),
                commercial.departureGate(),
                commercial.departureScheduled(),
                commercial.departureEstimated(),
                commercial.departureActual(),
                commercial.arrivalAirport(),
                commercial.arrivalIata(),
                commercial.arrivalIcao(),
                commercial.arrivalTerminal(),
                commercial.arrivalGate(),
                commercial.arrivalScheduled(),
                commercial.arrivalEstimated(),
                commercial.arrivalActual(),
                commercial.route(),
                // Live telemetry — prefer live data when available
                live.latitude() != null ? live.latitude() : commercial.latitude(),
                live.longitude() != null ? live.longitude() : commercial.longitude(),
                live.baroAltitude() != null ? live.baroAltitude() : commercial.altitude(),
                live.velocity() != null ? live.velocity() : commercial.speed(),
                live.verticalRate() != null ? live.verticalRate() : commercial.speedVertical(),
                live.trueTrack() != null ? live.trueTrack() : commercial.direction(),
                live.onGround() != null ? live.onGround() : commercial.isGround(),
                live.lastContact() != null ? String.valueOf(live.lastContact()) : commercial.liveUpdated(),
                commercial.departureDelay(),
                commercial.arrivalDelay()
        );
    }

    private void validateIataIfPresent(String value, String field) {
        if (value != null && !value.isBlank() && !value.matches("(?i)^[A-Z]{3}$")) {
            throw new IllegalArgumentException(field + " must be a 3-letter IATA code");
        }
    }
}
