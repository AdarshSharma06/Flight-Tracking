package com.flighttracking.service;

import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.dto.flight.FlightSearchResponse;
import com.flighttracking.dto.flight.FlightTrackingDto;
import com.flighttracking.provider.FlightProvider;
import com.flighttracking.provider.TrackingProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.flighttracking.util.FlightNumberUtils;

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
        String normalizedFlightIata = FlightNumberUtils.normalize(flightIata);
        FlightSearchResponse response = flightProvider.searchFlights(
                normalizedFlightIata, depIata, arrIata, airlineIata, flightStatus, limit
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
        String normalized = FlightNumberUtils.normalize(flightNumber);
        return flightProvider.getFlightByNumber(normalized);
    }

    public FlightTrackingDto getTracking(String flightNumber) {
        if (flightNumber == null || flightNumber.isBlank()) {
            throw new IllegalArgumentException("flightNumber must not be blank");
        }
        String normalized = FlightNumberUtils.normalize(flightNumber);

        // Get commercial flight data from AeroDataBox
        FlightTrackingDto commercial = flightProvider.getFlightTracking(normalized);

        // Enrich with live telemetry from AirLabs (single lookup by IATA)
        Optional<TrackingProvider.LiveTrackingData> liveData = resolveLiveData(normalized);

        if (liveData.isEmpty()) {
            return commercial;
        }

        // Merge: commercial identity + live telemetry
        return mergeTracking(commercial, liveData.get());
    }

    private Optional<TrackingProvider.LiveTrackingData> resolveLiveData(String normalizedFlightIata) {
        if (normalizedFlightIata == null || normalizedFlightIata.isBlank()) return Optional.empty();
        try {
            // Single AirLabs lookup by normalized IATA flight number (e.g., 6E6706)
            // One tracking request -> at most one AirLabs call (free tier)
            return trackingProvider.getByFlightIata(normalizedFlightIata);
        } catch (Exception e) {
            log.warn("AirLabs live tracking unavailable for flight {}: {}", normalizedFlightIata, e.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    private FlightTrackingDto mergeTracking(FlightTrackingDto commercial, TrackingProvider.LiveTrackingData live) {
        // Only overwrite null commercial fields with live data
        // Do NOT overwrite valid commercial data with null AirLabs data
        // AirLabs units: alt (feet/m - preserved as-is), speed (kts/km/h - preserved), dir degrees, v_speed preserved
        // Frontend expects altitude m, speed km/h but we preserve existing convention (no conversion) as before
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
                // Live telemetry — prefer AirLabs when available
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
