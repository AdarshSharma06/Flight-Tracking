package com.flighttracking.service;

import com.flighttracking.client.AviationStackClient;
import com.flighttracking.client.AviationStackResponse;
import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.dto.flight.FlightSearchResponse;
import com.flighttracking.dto.flight.FlightTrackingDto;
import com.flighttracking.exception.ResourceNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.List;

@Service
public class FlightService {

    private static final Logger log = LoggerFactory.getLogger(FlightService.class);

    private final AviationStackClient client;

    public FlightService(AviationStackClient client) {
        this.client = client;
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
        AviationStackResponse response = client.searchFlights(
                flightIata, depIata, arrIata, airlineIata, flightStatus, limit
        );
        List<FlightDto> flights = response.data() == null ? List.of() :
                response.data().stream().map(this::toDto).toList();

        // sorting support - in-memory after fetching
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
        return toDto(findFlightData(flightNumber));
    }

    public FlightTrackingDto getTracking(String flightNumber) {
        AviationStackResponse.FlightData data = findFlightData(flightNumber);
        return toTrackingDto(data);
    }

    private AviationStackResponse.FlightData findFlightData(String flightNumber) {
        if (flightNumber == null || flightNumber.isBlank()) {
            throw new IllegalArgumentException("flightNumber must not be blank");
        }
        String normalized = flightNumber.trim().toUpperCase();
        AviationStackResponse response = client.getFlightsByIata(normalized);
        List<AviationStackResponse.FlightData> data = response.data();
        if (data == null || data.isEmpty()) {
            throw new ResourceNotFoundException("Flight not found: " + normalized);
        }
        return data.stream()
                .filter(f -> f.flight() != null && normalized.equalsIgnoreCase(f.flight().iata()))
                .findFirst()
                .orElse(data.get(0));
    }

    private FlightDto toDto(AviationStackResponse.FlightData d) {
        String depDelay = resolveDelay(
                d.departure() != null ? d.departure().scheduled() : null,
                d.departure() != null ? d.departure().actual() : null,
                d.departure() != null ? d.departure().delay() : null,
                d.flight() != null ? d.flight().iata() : null, "departure");
        String arrDelay = resolveDelay(
                d.arrival() != null ? d.arrival().scheduled() : null,
                d.arrival() != null ? d.arrival().actual() : null,
                d.arrival() != null ? d.arrival().delay() : null,
                d.flight() != null ? d.flight().iata() : null, "arrival");
        return new FlightDto(
                d.flight() != null ? d.flight().number() : null,
                d.flight() != null ? d.flight().iata() : null,
                d.flight() != null ? d.flight().icao() : null,
                d.airline() != null ? d.airline().name() : null,
                d.airline() != null ? d.airline().iata() : null,
                d.airline() != null ? d.airline().icao() : null,
                d.departure() != null ? d.departure().airport() : null,
                d.departure() != null ? d.departure().iata() : null,
                d.departure() != null ? d.departure().icao() : null,
                d.departure() != null ? d.departure().terminal() : null,
                d.departure() != null ? d.departure().gate() : null,
                d.departure() != null ? d.departure().scheduled() : null,
                d.departure() != null ? d.departure().estimated() : null,
                d.departure() != null ? d.departure().actual() : null,
                depDelay,
                d.arrival() != null ? d.arrival().airport() : null,
                d.arrival() != null ? d.arrival().iata() : null,
                d.arrival() != null ? d.arrival().icao() : null,
                d.arrival() != null ? d.arrival().terminal() : null,
                d.arrival() != null ? d.arrival().gate() : null,
                d.arrival() != null ? d.arrival().scheduled() : null,
                d.arrival() != null ? d.arrival().estimated() : null,
                d.arrival() != null ? d.arrival().actual() : null,
                arrDelay,
                d.flightStatus(),
                d.aircraft() != null ? d.aircraft().registration() : null,
                d.aircraft() != null ? d.aircraft().iata() : null,
                d.aircraft() != null ? d.aircraft().icao() : null
        );
    }

    private FlightTrackingDto toTrackingDto(AviationStackResponse.FlightData d) {
        String route = null;
        if (d.departure() != null && d.arrival() != null
                && d.departure().iata() != null && d.arrival().iata() != null) {
            route = d.departure().iata() + " -> " + d.arrival().iata();
        }
        AviationStackResponse.Live live = d.live();
        String depDelay = resolveDelay(
                d.departure() != null ? d.departure().scheduled() : null,
                d.departure() != null ? d.departure().actual() : null,
                d.departure() != null ? d.departure().delay() : null,
                d.flight() != null ? d.flight().iata() : null, "departure");
        String arrDelay = resolveDelay(
                d.arrival() != null ? d.arrival().scheduled() : null,
                d.arrival() != null ? d.arrival().actual() : null,
                d.arrival() != null ? d.arrival().delay() : null,
                d.flight() != null ? d.flight().iata() : null, "arrival");
        return new FlightTrackingDto(
                d.flight() != null ? d.flight().number() : null,
                d.flight() != null ? d.flight().iata() : null,
                d.flight() != null ? d.flight().icao() : null,
                d.flightDate(),
                d.flightStatus(),
                d.airline() != null ? d.airline().name() : null,
                d.airline() != null ? d.airline().iata() : null,
                d.airline() != null ? d.airline().icao() : null,
                d.aircraft() != null ? d.aircraft().registration() : null,
                d.aircraft() != null ? d.aircraft().iata() : null,
                d.aircraft() != null ? d.aircraft().icao() : null,
                d.departure() != null ? d.departure().airport() : null,
                d.departure() != null ? d.departure().iata() : null,
                d.departure() != null ? d.departure().icao() : null,
                d.departure() != null ? d.departure().terminal() : null,
                d.departure() != null ? d.departure().gate() : null,
                d.departure() != null ? d.departure().scheduled() : null,
                d.departure() != null ? d.departure().estimated() : null,
                d.departure() != null ? d.departure().actual() : null,
                d.arrival() != null ? d.arrival().airport() : null,
                d.arrival() != null ? d.arrival().iata() : null,
                d.arrival() != null ? d.arrival().icao() : null,
                d.arrival() != null ? d.arrival().terminal() : null,
                d.arrival() != null ? d.arrival().gate() : null,
                d.arrival() != null ? d.arrival().scheduled() : null,
                d.arrival() != null ? d.arrival().estimated() : null,
                d.arrival() != null ? d.arrival().actual() : null,
                route,
                live != null ? live.latitude() : null,
                live != null ? live.longitude() : null,
                live != null ? live.altitude() : null,
                live != null ? live.speedHorizontal() : null,
                live != null ? live.speedVertical() : null,
                live != null ? live.direction() : null,
                live != null ? live.isGround() : null,
                live != null ? live.updated() : null,
                depDelay,
                arrDelay
        );
    }

    private void validateIataIfPresent(String value, String field) {
        if (value != null && !value.isBlank() && !value.matches("(?i)^[A-Z]{3}$")) {
            throw new IllegalArgumentException(field + " must be a 3-letter IATA code");
        }
    }

    /**
     * Resolve delay canonically from timestamps, preferring computed value over provider value.
     * Provider delay is a String minutes (e.g., "4", "45"). Computed delay is derived from
     * scheduled vs actual if both present. If computed differs from provider by > tolerance,
     * computed wins and a warning is logged. Preserves null when both computed==0 and provider==null
     * to keep existing semantics for on-time flights without explicit delay.
     */
    private String resolveDelay(String scheduled, String actual, String providerDelay, String flightIata, String phase) {
        if (scheduled == null || scheduled.isBlank() || actual == null || actual.isBlank()) {
            return providerDelay;
        }
        Long computed = computeDelayMinutes(scheduled, actual);
        if (computed == null) {
            return providerDelay;
        }
        // Normalize provider to Long if possible
        Long providerMinutes = null;
        if (providerDelay != null && !providerDelay.isBlank()) {
            try {
                providerMinutes = Long.parseLong(providerDelay.trim());
            } catch (NumberFormatException ignored) {
                // provider value not numeric – trust computed
                providerMinutes = null;
            }
        }
        // If computed 0 and provider is null/blank, preserve null to keep on-time semantics (existing tests expect null)
        if (computed == 0 && (providerDelay == null || providerDelay.isBlank())) {
            return null;
        }
        if (providerMinutes == null) {
            return String.valueOf(computed);
        }
        if (!providerMinutes.equals(computed)) {
            log.warn("Delay mismatch for flight {} {}: provider={} computed={} scheduled={} actual={}",
                    flightIata, phase, providerMinutes, computed, scheduled, actual);
            return String.valueOf(computed);
        }
        return providerDelay;
    }

    private Long computeDelayMinutes(String scheduled, String actual) {
        Instant s = parseTimestamp(scheduled);
        Instant a = parseTimestamp(actual);
        if (s == null || a == null) return null;
        return Duration.between(s, a).toMinutes();
    }

    private Instant parseTimestamp(String ts) {
        if (ts == null || ts.isBlank()) return null;
        String normalized = ts.trim();
        // AviationStack formats: "2026-09-01T02:00:00+0000" (no colon) or "2026-09-01T02:00:00+00:00" or ISO with Z/fraction
        // Normalize +0000 -> +00:00
        if (normalized.matches(".*[+-]\\d{4}$")) {
            normalized = normalized.replaceFirst("([+-]\\d{2})(\\d{2})$", "$1:$2");
        }
        // Try OffsetDateTime with ISO
        try {
            return OffsetDateTime.parse(normalized, DateTimeFormatter.ISO_OFFSET_DATE_TIME).toInstant();
        } catch (DateTimeParseException ignored) {}
        // Try with pattern yyyy-MM-dd'T'HH:mm:ssZ
        try {
            DateTimeFormatter f = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssZ");
            return OffsetDateTime.parse(normalized, f).toInstant();
        } catch (DateTimeParseException ignored) {}
        // Try with fraction + Z: "yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'"
        try {
            // Instant.parse handles "2026-09-01T02:00:00Z" and with fraction
            if (normalized.endsWith("Z")) {
                return Instant.parse(normalized);
            }
        } catch (DateTimeParseException ignored) {}
        // Try without colon offset already handled, try generic
        try {
            return OffsetDateTime.parse(normalized).toInstant();
        } catch (Exception ignored) {}
        log.debug("Unable to parse timestamp for delay computation: {}", ts);
        return null;
    }
}
