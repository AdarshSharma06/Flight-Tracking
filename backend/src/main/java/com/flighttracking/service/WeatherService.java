package com.flighttracking.service;

import com.flighttracking.client.AirportClient;
import com.flighttracking.client.GoogleWeatherClient;
import com.flighttracking.client.OpenMeteoClient;
import com.flighttracking.dto.airport.AirportDto;
import com.flighttracking.dto.weather.WeatherDto;
import com.flighttracking.exception.ExternalApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

@Service
public class WeatherService {

    private static final Logger log = LoggerFactory.getLogger(WeatherService.class);

    private final GoogleWeatherClient googleWeatherClient;
    private final OpenMeteoClient openMeteoClient;
    private final AirportClient airportClient;

    public WeatherService(GoogleWeatherClient googleWeatherClient, OpenMeteoClient openMeteoClient, AirportClient airportClient) {
        this.googleWeatherClient = googleWeatherClient;
        this.openMeteoClient = openMeteoClient;
        this.airportClient = airportClient;
    }

    @Cacheable(value = "weather", key = "#latitude + ',' + #longitude")
    public WeatherDto getByCoordinates(double latitude, double longitude) {
        return fetchWeatherWithFallback(latitude, longitude);
    }

    public WeatherDto getByAirport(String iata) {
        if (iata == null || !iata.matches("(?i)^[A-Z]{3}$")) {
            throw new IllegalArgumentException("IATA code must be 3 letters");
        }
        AirportDto airport = airportClient.getByIata(iata);
        if (airport.latitude() == null || airport.longitude() == null) {
            throw new IllegalArgumentException("Airport coordinates not available for " + iata);
        }
        return fetchWeatherWithFallback(airport.latitude(), airport.longitude());
    }

    private WeatherDto fetchWeatherWithFallback(double latitude, double longitude) {
        // Primary: Google Weather API (if configured)
        if (googleWeatherClient.isConfigured()) {
            try {
                return googleWeatherClient.getCurrentWeather(latitude, longitude);
            } catch (Exception e) {
                log.warn("Google Weather API failed, falling back to Open-Meteo: {}", e.getMessage());
            }
        }

        // Fallback: Open-Meteo (free, no key required)
        try {
            return openMeteoClient.getCurrentWeather(latitude, longitude);
        } catch (Exception e) {
            log.error("Open-Meteo weather also failed: {}", e.getMessage());
            throw new ExternalApiException("Weather data unavailable from all providers", e);
        }
    }
}
