package com.flighttracking.service;

import com.flighttracking.client.AirportClient;
import com.flighttracking.client.OverpassClient;
import com.flighttracking.dto.airport.AirportDto;
import com.flighttracking.dto.airport.AirportExplorerDto;
import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.exception.ExternalApiException;
import com.flighttracking.provider.FlightProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AirportService {

    private static final Logger log = LoggerFactory.getLogger(AirportService.class);

    private final AirportClient airportClient;
    private final FlightProvider flightProvider;
    private final OverpassClient overpassClient;

    public AirportService(AirportClient airportClient, FlightProvider flightProvider, OverpassClient overpassClient) {
        this.airportClient = airportClient;
        this.flightProvider = flightProvider;
        this.overpassClient = overpassClient;
    }

    @Cacheable(value = "airports", key = "#iata.toUpperCase()")
    public AirportDto getAirport(String iata) {
        validateIata(iata);
        // Primary: AeroDataBox via provider abstraction — fallback to local data on any provider failure
        try {
            return flightProvider.getAirportByIata(iata)
                    .orElseGet(() -> airportClient.getByIata(iata));
        } catch (ExternalApiException e) {
            log.warn("AeroDataBox airport lookup failed for {}: {} — falling back to local data", iata, e.getMessage());
            return airportClient.getByIata(iata);
        } catch (Exception e) {
            log.warn("Airport lookup failed for {}: {} — falling back to local data", iata, e.getMessage());
            return airportClient.getByIata(iata);
        }
    }

    public List<FlightDto> getDepartures(String iata, Integer limit) {
        validateIata(iata);
        if (limit != null && (limit < 1 || limit > 100)) {
            throw new IllegalArgumentException("limit must be between 1 and 100");
        }
        try {
            return flightProvider.getAirportDepartures(iata.toUpperCase(), limit);
        } catch (ExternalApiException e) {
            log.warn("AeroDataBox departures unavailable for {}: {} (returning empty list)", iata, e.getMessage());
            return List.of();
        } catch (Exception e) {
            log.warn("Failed to fetch departures for {}: {} (returning empty list)", iata, e.getMessage());
            return List.of();
        }
    }

    public List<FlightDto> getArrivals(String iata, Integer limit) {
        validateIata(iata);
        if (limit != null && (limit < 1 || limit > 100)) {
            throw new IllegalArgumentException("limit must be between 1 and 100");
        }
        try {
            return flightProvider.getAirportArrivals(iata.toUpperCase(), limit);
        } catch (ExternalApiException e) {
            log.warn("AeroDataBox arrivals unavailable for {}: {} (returning empty list)", iata, e.getMessage());
            return List.of();
        } catch (Exception e) {
            log.warn("Failed to fetch arrivals for {}: {} (returning empty list)", iata, e.getMessage());
            return List.of();
        }
    }

    public List<AirportDto> searchAirports(String query) {
        return airportClient.search(query);
    }

    @Cacheable(value = "airport-explorer", key = "#iata.toUpperCase()")
    public AirportExplorerDto getAirportExplorer(String iata) {
        validateIata(iata);
        AirportDto airport = getAirport(iata);
        if (airport.latitude() == null || airport.longitude() == null) {
            log.warn("No coordinates for airport {} — returning empty explorer", iata);
            return new AirportExplorerDto(iata.toUpperCase(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        }
        return overpassClient.fetchAirportData(iata, airport.latitude(), airport.longitude());
    }

    private void validateIata(String iata) {
        if (iata == null || !iata.matches("(?i)^[A-Z]{3}$")) {
            throw new IllegalArgumentException("IATA code must be 3 letters");
        }
    }
}
