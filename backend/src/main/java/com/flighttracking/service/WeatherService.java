package com.flighttracking.service;

import com.flighttracking.client.AirportClient;
import com.flighttracking.client.OpenMeteoClient;
import com.flighttracking.dto.airport.AirportDto;
import com.flighttracking.dto.weather.WeatherDto;
import org.springframework.stereotype.Service;

@Service
public class WeatherService {

    private final OpenMeteoClient openMeteoClient;
    private final AirportClient airportClient;

    public WeatherService(OpenMeteoClient openMeteoClient, AirportClient airportClient) {
        this.openMeteoClient = openMeteoClient;
        this.airportClient = airportClient;
    }

    public WeatherDto getByCoordinates(double latitude, double longitude) {
        return openMeteoClient.getCurrentWeather(latitude, longitude);
    }

    public WeatherDto getByAirport(String iata) {
        if (iata == null || !iata.matches("(?i)^[A-Z]{3}$")) {
            throw new IllegalArgumentException("IATA code must be 3 letters");
        }
        AirportDto airport = airportClient.getByIata(iata);
        if (airport.latitude() == null || airport.longitude() == null) {
            throw new IllegalArgumentException("Airport coordinates not available for " + iata);
        }
        return openMeteoClient.getCurrentWeather(airport.latitude(), airport.longitude());
    }
}
