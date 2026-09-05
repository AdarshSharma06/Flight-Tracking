package com.flighttracking.service;

import com.flighttracking.client.AirportClient;
import com.flighttracking.dto.airport.AirportDto;
import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.provider.FlightProvider;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AirportService {

    private final AirportClient airportClient;
    private final FlightProvider flightProvider;

    public AirportService(AirportClient airportClient, FlightProvider flightProvider) {
        this.airportClient = airportClient;
        this.flightProvider = flightProvider;
    }

    @Cacheable(value = "airports", key = "#iata.toUpperCase()")
    public AirportDto getAirport(String iata) {
        validateIata(iata);
        // Primary: AeroDataBox via provider abstraction
        return flightProvider.getAirportByIata(iata)
                .orElseGet(() -> airportClient.getByIata(iata));
    }

    public List<FlightDto> getDepartures(String iata, Integer limit) {
        validateIata(iata);
        if (limit != null && (limit < 1 || limit > 100)) {
            throw new IllegalArgumentException("limit must be between 1 and 100");
        }
        return flightProvider.getAirportDepartures(iata.toUpperCase(), limit);
    }

    public List<FlightDto> getArrivals(String iata, Integer limit) {
        validateIata(iata);
        if (limit != null && (limit < 1 || limit > 100)) {
            throw new IllegalArgumentException("limit must be between 1 and 100");
        }
        return flightProvider.getAirportArrivals(iata.toUpperCase(), limit);
    }

    private void validateIata(String iata) {
        if (iata == null || !iata.matches("(?i)^[A-Z]{3}$")) {
            throw new IllegalArgumentException("IATA code must be 3 letters");
        }
    }
}
