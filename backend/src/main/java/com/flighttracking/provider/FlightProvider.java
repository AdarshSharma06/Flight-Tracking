package com.flighttracking.provider;

import com.flighttracking.dto.airport.AirportDto;
import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.dto.flight.FlightSearchResponse;
import com.flighttracking.dto.flight.FlightTrackingDto;

import java.util.Optional;

/**
 * Provider interface for commercial flight data.
 * Implementations handle flight search, details, airport info, and arrivals/departures.
 */
public interface FlightProvider {

    FlightSearchResponse searchFlights(String flightIata, String depIata, String arrIata,
                                       String airlineIata, String flightStatus, Integer limit);

    FlightDto getFlightByNumber(String flightNumber);

    FlightTrackingDto getFlightTracking(String flightNumber);

    java.util.List<FlightDto> getAirportDepartures(String iata, Integer limit);

    java.util.List<FlightDto> getAirportArrivals(String iata, Integer limit);

    /**
     * Get airport information by IATA code.
     * Returns Optional.empty() if the provider cannot resolve this airport.
     */
    Optional<AirportDto> getAirportByIata(String iata);

    String getProviderName();
}
