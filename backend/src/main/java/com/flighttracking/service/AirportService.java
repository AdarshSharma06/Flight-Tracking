package com.flighttracking.service;

import com.flighttracking.client.AirportClient;
import com.flighttracking.client.AviationStackClient;
import com.flighttracking.client.AviationStackResponse;
import com.flighttracking.dto.airport.AirportDto;
import com.flighttracking.dto.flight.FlightDto;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AirportService {

    private final AirportClient airportClient;
    private final AviationStackClient aviationStackClient;

    public AirportService(AirportClient airportClient, AviationStackClient aviationStackClient) {
        this.airportClient = airportClient;
        this.aviationStackClient = aviationStackClient;
    }

    @Cacheable(value = "airports", key = "#iata.toUpperCase()")
    public AirportDto getAirport(String iata) {
        validateIata(iata);
        return airportClient.getByIata(iata);
    }

    public List<FlightDto> getDepartures(String iata, Integer limit) {
        validateIata(iata);
        if (limit != null && (limit < 1 || limit > 100)) {
            throw new IllegalArgumentException("limit must be between 1 and 100");
        }
        AviationStackResponse response = aviationStackClient.searchFlights(null, iata.toUpperCase(), null, null, null, limit);
        return mapFlights(response);
    }

    public List<FlightDto> getArrivals(String iata, Integer limit) {
        validateIata(iata);
        if (limit != null && (limit < 1 || limit > 100)) {
            throw new IllegalArgumentException("limit must be between 1 and 100");
        }
        AviationStackResponse response = aviationStackClient.searchFlights(null, null, iata.toUpperCase(), null, null, limit);
        return mapFlights(response);
    }

    private List<FlightDto> mapFlights(AviationStackResponse response) {
        if (response.data() == null) return List.of();
        return response.data().stream().map(d -> new FlightDto(
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
        )).toList();
    }

    private void validateIata(String iata) {
        if (iata == null || !iata.matches("(?i)^[A-Z]{3}$")) {
            throw new IllegalArgumentException("IATA code must be 3 letters");
        }
        // also validate existence for lookup? For departures/arrivals we allow any IATA even if not in local DB, but verify format
    }
}
