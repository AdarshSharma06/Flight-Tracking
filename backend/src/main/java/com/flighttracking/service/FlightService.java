package com.flighttracking.service;

import com.flighttracking.client.AviationStackClient;
import com.flighttracking.client.AviationStackResponse;
import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.dto.flight.FlightSearchResponse;
import com.flighttracking.dto.flight.FlightTrackingDto;
import com.flighttracking.exception.ResourceNotFoundException;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;

@Service
public class FlightService {

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
                d.departure() != null ? d.departure().delay() : null,
                d.arrival() != null ? d.arrival().airport() : null,
                d.arrival() != null ? d.arrival().iata() : null,
                d.arrival() != null ? d.arrival().icao() : null,
                d.arrival() != null ? d.arrival().terminal() : null,
                d.arrival() != null ? d.arrival().gate() : null,
                d.arrival() != null ? d.arrival().scheduled() : null,
                d.arrival() != null ? d.arrival().estimated() : null,
                d.arrival() != null ? d.arrival().actual() : null,
                d.arrival() != null ? d.arrival().delay() : null,
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
                d.departure() != null ? d.departure().delay() : null,
                d.arrival() != null ? d.arrival().delay() : null
        );
    }

    private void validateIataIfPresent(String value, String field) {
        if (value != null && !value.isBlank() && !value.matches("(?i)^[A-Z]{3}$")) {
            throw new IllegalArgumentException(field + " must be a 3-letter IATA code");
        }
    }
}
