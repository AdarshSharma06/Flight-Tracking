package com.flighttracking.provider;

import com.flighttracking.client.AerodataboxClient;
import com.flighttracking.client.AerodataboxResponse;
import com.flighttracking.dto.airport.AirportDto;
import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.dto.flight.FlightSearchResponse;
import com.flighttracking.dto.flight.FlightTrackingDto;
import com.flighttracking.exception.ResourceNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class AerodataboxFlightProvider implements FlightProvider {

    private static final Logger log = LoggerFactory.getLogger(AerodataboxFlightProvider.class);

    private final AerodataboxClient client;

    public AerodataboxFlightProvider(AerodataboxClient client) {
        this.client = client;
    }

    @Override
    public FlightSearchResponse searchFlights(String flightIata, String depIata, String arrIata,
                                              String airlineIata, String flightStatus, Integer limit) {
        if (flightIata != null && !flightIata.isBlank()) {
            List<AerodataboxResponse.FlightContract> flights = client.getFlightByNumber(flightIata);
            List<FlightDto> dtos = flights.stream()
                    .map(this::toDto)
                    .toList();
            return applyFlightNumberFilters(dtos, depIata, arrIata, airlineIata, flightStatus, limit);
        }

        // Use FIDS for airport-based searches
        if (depIata != null && !depIata.isBlank()) {
            AerodataboxResponse.AirportFidsContract fids = client.getAirportFids(depIata, "Departure");
            List<FlightDto> dtos = fids != null && fids.departures() != null
                    ? fids.departures().stream().map(this::airportFlightToDto).toList()
                    : List.of();
            return applyFilters(dtos, arrIata, airlineIata, flightStatus, limit);
        }

        if (arrIata != null && !arrIata.isBlank()) {
            AerodataboxResponse.AirportFidsContract fids = client.getAirportFids(arrIata, "Arrival");
            List<FlightDto> dtos = fids != null && fids.arrivals() != null
                    ? fids.arrivals().stream().map(this::airportFlightToDto).toList()
                    : List.of();
            return applyFilters(dtos, depIata, airlineIata, flightStatus, limit);
        }

        // Status-only or airline-only search without an airport is not supported by AeroDataBox FIDS
        if ((flightStatus != null && !flightStatus.isBlank())
                || (airlineIata != null && !airlineIata.isBlank())) {
            throw new IllegalArgumentException(
                    "Status and airline filters require an airport code (dep_iata or arr_iata). "
                            + "AeroDataBox FIDS endpoint requires an airport context to search flights.");
        }

        return new FlightSearchResponse(List.of(), 0);
    }

    @Override
    public FlightDto getFlightByNumber(String flightNumber) {
        List<AerodataboxResponse.FlightContract> flights = client.getFlightByNumber(flightNumber);
        if (flights.isEmpty()) {
            throw new ResourceNotFoundException("Flight not found: " + flightNumber);
        }
        AerodataboxResponse.FlightContract flight = flights.get(0);
        return toDto(flight);
    }

    @Override
    public FlightTrackingDto getFlightTracking(String flightNumber) {
        List<AerodataboxResponse.FlightContract> flights = client.getFlightByNumber(flightNumber);
        if (flights.isEmpty()) {
            throw new ResourceNotFoundException("Flight not found: " + flightNumber);
        }
        return toTrackingDto(selectBestRecord(flights));
    }

    @Override
    public List<FlightDto> getAirportDepartures(String iata, Integer limit) {
        AerodataboxResponse.AirportFidsContract fids = client.getAirportFids(iata, "Departure");
        List<FlightDto> dtos = fids != null && fids.departures() != null
                ? fids.departures().stream().map(this::airportFlightToDto).toList()
                : List.of();
        if (limit != null && limit > 0 && dtos.size() > limit) {
            return dtos.subList(0, limit);
        }
        return dtos;
    }

    @Override
    public List<FlightDto> getAirportArrivals(String iata, Integer limit) {
        AerodataboxResponse.AirportFidsContract fids = client.getAirportFids(iata, "Arrival");
        List<FlightDto> dtos = fids != null && fids.arrivals() != null
                ? fids.arrivals().stream().map(this::airportFlightToDto).toList()
                : List.of();
        if (limit != null && limit > 0 && dtos.size() > limit) {
            return dtos.subList(0, limit);
        }
        return dtos;
    }

    @Override
    public Optional<AirportDto> getAirportByIata(String iata) {
        AerodataboxResponse.AirportContract airport = client.getAirportByIata(iata);
        if (airport == null) {
            return Optional.empty();
        }
        return Optional.of(mapAirport(airport));
    }

    private AirportDto mapAirport(AerodataboxResponse.AirportContract a) {
        return new AirportDto(
                a.iata(),
                a.icao(),
                a.fullName(),
                a.municipalityName(),
                a.country() != null ? a.country().name() : null,
                a.location() != null ? a.location().lat() : null,
                a.location() != null ? a.location().lon() : null,
                a.timeZone(),
                a.country() != null ? a.country().code() : null
        );
    }

    @Override
    public String getProviderName() {
        return "AeroDataBox";
    }

    // --- Mapping Methods ---

    private FlightDto toDto(AerodataboxResponse.FlightContract f) {
        AerodataboxResponse.FlightAirportMovementContract dep = f.departure();
        AerodataboxResponse.FlightAirportMovementContract arr = f.arrival();

        String depScheduled = extractUtcTime(dep != null ? dep.scheduledTime() : null);
        String depEstimated = extractUtcTime(dep != null ? dep.revisedTime() : null);
        String depActual = extractUtcTime(dep != null ? dep.runwayTime() : null);
        String arrScheduled = extractUtcTime(arr != null ? arr.scheduledTime() : null);
        String arrEstimated = extractUtcTime(arr != null ? arr.revisedTime() : null);
        String arrActual = extractUtcTime(arr != null ? arr.runwayTime() : null);

        String depDelay = computeDelayMinutes(depScheduled, depActual);
        String arrDelay = computeDelayMinutes(arrScheduled, arrActual);

        return new FlightDto(
                f.number(),
                f.number(),
                f.callSign(),
                f.airline() != null ? f.airline().name() : null,
                f.airline() != null ? f.airline().iata() : null,
                f.airline() != null ? f.airline().icao() : null,
                dep != null && dep.airport() != null ? dep.airport().name() : null,
                dep != null && dep.airport() != null ? dep.airport().iata() : null,
                dep != null && dep.airport() != null ? dep.airport().icao() : null,
                dep != null ? dep.terminal() : null,
                dep != null ? dep.gate() : null,
                depScheduled,
                depEstimated,
                depActual,
                depDelay,
                arr != null && arr.airport() != null ? arr.airport().name() : null,
                arr != null && arr.airport() != null ? arr.airport().iata() : null,
                arr != null && arr.airport() != null ? arr.airport().icao() : null,
                arr != null ? arr.terminal() : null,
                arr != null ? arr.gate() : null,
                arrScheduled,
                arrEstimated,
                arrActual,
                arrDelay,
                mapStatus(f.status()),
                f.aircraft() != null ? f.aircraft().reg() : null,
                f.aircraft() != null ? f.aircraft().model() : null,
                f.aircraft() != null ? f.aircraft().modeS() : null
        );
    }

    private FlightDto airportFlightToDto(AerodataboxResponse.AirportFlightContract af) {
        AerodataboxResponse.FlightAirportMovementContract dep = af.departure();
        AerodataboxResponse.FlightAirportMovementContract arr = af.arrival();
        AerodataboxResponse.FlightAirportMovementContract movement = af.movement();

        // For departure FIDS, the movement field is the departure; for arrival, it's the arrival
        AerodataboxResponse.FlightAirportMovementContract effectiveDep = dep != null ? dep : movement;
        AerodataboxResponse.FlightAirportMovementContract effectiveArr = arr;

        String depScheduled = extractUtcTime(effectiveDep != null ? effectiveDep.scheduledTime() : null);
        String depEstimated = extractUtcTime(effectiveDep != null ? effectiveDep.revisedTime() : null);
        String depActual = extractUtcTime(effectiveDep != null ? effectiveDep.runwayTime() : null);
        String arrScheduled = extractUtcTime(effectiveArr != null ? effectiveArr.scheduledTime() : null);
        String arrEstimated = extractUtcTime(effectiveArr != null ? effectiveArr.revisedTime() : null);
        String arrActual = extractUtcTime(effectiveArr != null ? effectiveArr.runwayTime() : null);

        String depDelay = computeDelayMinutes(depScheduled, depActual);
        String arrDelay = computeDelayMinutes(arrScheduled, arrActual);

        return new FlightDto(
                af.number(),
                af.number(),
                af.callSign(),
                af.airline() != null ? af.airline().name() : null,
                af.airline() != null ? af.airline().iata() : null,
                af.airline() != null ? af.airline().icao() : null,
                effectiveDep != null && effectiveDep.airport() != null ? effectiveDep.airport().name() : null,
                effectiveDep != null && effectiveDep.airport() != null ? effectiveDep.airport().iata() : null,
                effectiveDep != null && effectiveDep.airport() != null ? effectiveDep.airport().icao() : null,
                effectiveDep != null ? effectiveDep.terminal() : null,
                effectiveDep != null ? effectiveDep.gate() : null,
                depScheduled,
                depEstimated,
                depActual,
                depDelay,
                effectiveArr != null && effectiveArr.airport() != null ? effectiveArr.airport().name() : null,
                effectiveArr != null && effectiveArr.airport() != null ? effectiveArr.airport().iata() : null,
                effectiveArr != null && effectiveArr.airport() != null ? effectiveArr.airport().icao() : null,
                effectiveArr != null ? effectiveArr.terminal() : null,
                effectiveArr != null ? effectiveArr.gate() : null,
                arrScheduled,
                arrEstimated,
                arrActual,
                arrDelay,
                mapStatus(af.status()),
                af.aircraft() != null ? af.aircraft().reg() : null,
                af.aircraft() != null ? af.aircraft().model() : null,
                af.aircraft() != null ? af.aircraft().modeS() : null
        );
    }

    private FlightTrackingDto toTrackingDto(AerodataboxResponse.FlightContract f) {
        AerodataboxResponse.FlightAirportMovementContract dep = f.departure();
        AerodataboxResponse.FlightAirportMovementContract arr = f.arrival();
        AerodataboxResponse.FlightLocationContract loc = f.location();

        String route = null;
        if (dep != null && arr != null
                && dep.airport() != null && arr.airport() != null
                && dep.airport().iata() != null && arr.airport().iata() != null) {
            route = dep.airport().iata() + " -> " + arr.airport().iata();
        }

        String depScheduled = extractUtcTime(dep != null ? dep.scheduledTime() : null);
        String depEstimated = extractUtcTime(dep != null ? dep.revisedTime() : null);
        String depActual = extractUtcTime(dep != null ? dep.runwayTime() : null);
        String arrScheduled = extractUtcTime(arr != null ? arr.scheduledTime() : null);
        String arrEstimated = extractUtcTime(arr != null ? arr.revisedTime() : null);
        String arrActual = extractUtcTime(arr != null ? arr.runwayTime() : null);

        String depDelay = computeDelayMinutes(depScheduled, depActual);
        String arrDelay = computeDelayMinutes(arrScheduled, arrActual);

        return new FlightTrackingDto(
                f.number(),
                f.number(),
                f.callSign(),
                null,
                mapStatus(f.status()),
                f.airline() != null ? f.airline().name() : null,
                f.airline() != null ? f.airline().iata() : null,
                f.airline() != null ? f.airline().icao() : null,
                f.aircraft() != null ? f.aircraft().reg() : null,
                f.aircraft() != null ? f.aircraft().model() : null,
                f.aircraft() != null ? f.aircraft().modeS() : null,
                dep != null && dep.airport() != null ? dep.airport().name() : null,
                dep != null && dep.airport() != null ? dep.airport().iata() : null,
                dep != null && dep.airport() != null ? dep.airport().icao() : null,
                dep != null ? dep.terminal() : null,
                dep != null ? dep.gate() : null,
                depScheduled,
                depEstimated,
                depActual,
                arr != null && arr.airport() != null ? arr.airport().name() : null,
                arr != null && arr.airport() != null ? arr.airport().iata() : null,
                arr != null && arr.airport() != null ? arr.airport().icao() : null,
                arr != null ? arr.terminal() : null,
                arr != null ? arr.gate() : null,
                arrScheduled,
                arrEstimated,
                arrActual,
                route,
                loc != null ? loc.lat() : null,
                loc != null ? loc.lon() : null,
                loc != null && loc.altitude() != null ? loc.altitude().feet() : null,
                loc != null && loc.groundSpeed() != null ? loc.groundSpeed().knots() : null,
                null,
                loc != null && loc.trueTrack() != null ? loc.trueTrack().degree() : null,
                null,
                f.lastUpdatedUtc(),
                depDelay,
                arrDelay
        );
    }

    // --- Utility Methods ---

    private String extractUtcTime(AerodataboxResponse.DateTimeContract dt) {
        if (dt == null) return null;
        return dt.utc();
    }

    private String mapStatus(AerodataboxResponse.FlightStatus status) {
        if (status == null) return null;
        return switch (status) {
            case Expected, CheckIn, Boarding, GateClosed -> "scheduled";
            case EnRoute, Approaching -> "active";
            case Departed -> "departed";
            case Arrived -> "landed";
            case Delayed -> "delayed";
            case Canceled, CanceledUncertain -> "cancelled";
            case Diverted -> "diverted";
            default -> status.name().toLowerCase();
        };
    }

    private String computeDelayMinutes(String scheduled, String actual) {
        if (scheduled == null || actual == null) return null;
        try {
            java.time.Instant s = java.time.Instant.parse(scheduled);
            java.time.Instant a = java.time.Instant.parse(actual);
            long minutes = java.time.Duration.between(s, a).toMinutes();
            return minutes > 0 ? String.valueOf(minutes) : null;
        } catch (Exception e) {
            return null;
        }
    }

    // --- Record Selection ---

    /**
     * Selects the most relevant flight record from multiple occurrences.
     * <p>
     * When AeroDataBox returns multiple records for the same flight number across a date range,
     * we must pick the one most likely to represent the currently operating flight.
     * A historical/landed occurrence must NOT be selected over a currently active one.
     * A future scheduled occurrence must NOT override an already departed/active occurrence.
     * <p>
     * Selection is deterministic and based on:
     * 1. Status weight (active > departed > scheduled > historical/cancelled)
     * 2. Data completeness (modeS, callSign, location populated)
     * 3. Time proximity (departure time closest to now)
     */
    AerodataboxResponse.FlightContract selectBestRecord(List<AerodataboxResponse.FlightContract> flights) {
        if (flights.size() == 1) {
            return flights.get(0);
        }

        Map<AerodataboxResponse.FlightContract, Integer> scores = flights.stream()
                .collect(Collectors.toMap(Function.identity(), this::relevanceScore));

        Instant now = Instant.now();

        return flights.stream()
                .min(Comparator
                        .<AerodataboxResponse.FlightContract>comparingInt(f -> -scores.get(f))
                        .thenComparing(f -> Math.abs(getDepartureInstant(f).map(t -> t.toEpochMilli() - now.toEpochMilli()).orElse(Long.MAX_VALUE)))
                        .thenComparing(f -> flights.indexOf(f)))
                .orElse(flights.get(0));
    }

    private int relevanceScore(AerodataboxResponse.FlightContract f) {
        int score = 0;

        if (f.status() != null) {
            score += switch (f.status()) {
                case Approaching -> 105;
                case EnRoute -> 100;
                case Departed -> 90;
                case Boarding, GateClosed -> 60;
                case CheckIn -> 50;
                case Expected, Delayed -> 40;
                case Arrived, Diverted -> 10;
                case Canceled, CanceledUncertain -> 5;
                default -> 20;
            };
        }

        if (f.aircraft() != null && f.aircraft().modeS() != null && !f.aircraft().modeS().isBlank()) {
            score += 10;
        }
        if (f.callSign() != null && !f.callSign().isBlank()) {
            score += 5;
        }
        if (f.location() != null) {
            score += 5;
        }

        return score;
    }

    private Optional<Instant> getDepartureInstant(AerodataboxResponse.FlightContract f) {
        if (f.departure() == null) return Optional.empty();

        // Prefer actual departure time, then revised/estimated, then scheduled
        String[] candidates = {
                extractUtcTime(f.departure().runwayTime()),
                extractUtcTime(f.departure().revisedTime()),
                extractUtcTime(f.departure().scheduledTime())
        };

        for (String utc : candidates) {
            if (utc != null && !utc.isBlank()) {
                try {
                    return Optional.of(Instant.parse(utc));
                } catch (DateTimeParseException e) {
                    // try next candidate
                }
            }
        }
        return Optional.empty();
    }

    private FlightSearchResponse applyFlightNumberFilters(List<FlightDto> flights,
                                                           String depIata, String arrIata,
                                                           String airlineFilter, String statusFilter,
                                                           Integer limit) {
        List<FlightDto> filtered = flights;

        if (depIata != null && !depIata.isBlank()) {
            String dep = depIata.trim().toUpperCase();
            filtered = filtered.stream()
                    .filter(f -> dep.equals(f.departureIata()))
                    .toList();
        }
        if (arrIata != null && !arrIata.isBlank()) {
            String arr = arrIata.trim().toUpperCase();
            filtered = filtered.stream()
                    .filter(f -> arr.equals(f.arrivalIata()))
                    .toList();
        }
        if (airlineFilter != null && !airlineFilter.isBlank()) {
            String af = airlineFilter.trim().toUpperCase();
            filtered = filtered.stream()
                    .filter(f -> af.equals(f.airlineIata()) || af.equals(f.airlineIcao()))
                    .toList();
        }
        if (statusFilter != null && !statusFilter.isBlank()) {
            String sf = statusFilter.trim().toLowerCase();
            filtered = filtered.stream()
                    .filter(f -> sf.equals(f.status()))
                    .toList();
        }
        if (limit != null && limit > 0 && filtered.size() > limit) {
            filtered = filtered.subList(0, limit);
        }
        return new FlightSearchResponse(filtered, filtered.size());
    }

    private FlightSearchResponse applyFilters(List<FlightDto> flights, String routeFilter,
                                              String airlineFilter, String statusFilter, Integer limit) {
        List<FlightDto> filtered = flights;

        if (routeFilter != null && !routeFilter.isBlank()) {
            String rf = routeFilter.trim().toUpperCase();
            filtered = filtered.stream()
                    .filter(f -> rf.equals(f.arrivalIata()) || rf.equals(f.departureIata()))
                    .toList();
        }
        if (airlineFilter != null && !airlineFilter.isBlank()) {
            String af = airlineFilter.trim().toUpperCase();
            filtered = filtered.stream()
                    .filter(f -> af.equals(f.airlineIata()) || af.equals(f.airlineIcao()))
                    .toList();
        }
        if (statusFilter != null && !statusFilter.isBlank()) {
            String sf = statusFilter.trim().toLowerCase();
            filtered = filtered.stream()
                    .filter(f -> sf.equals(f.status()))
                    .toList();
        }
        if (limit != null && limit > 0 && filtered.size() > limit) {
            filtered = filtered.subList(0, limit);
        }
        return new FlightSearchResponse(filtered, filtered.size());
    }
}
