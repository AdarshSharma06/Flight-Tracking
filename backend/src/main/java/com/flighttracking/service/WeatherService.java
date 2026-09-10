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
        if (googleWeatherClient.isConfigured()) {
            log.debug("Google Weather API is configured, attempting primary provider for {},{}", latitude, longitude);
            try {
                WeatherDto dto = googleWeatherClient.getCurrentWeather(latitude, longitude);
                log.debug("Google Weather succeeded for {},{}", latitude, longitude);
                return dto;
            } catch (Exception e) {
                log.warn("Google Weather API failed ({}): {} — falling back to Open-Meteo", e.getClass().getSimpleName(), e.getMessage());
                log.debug("Google Weather failure detail", e);
            }
        } else {
            log.debug("Google Weather API not configured (GOOGLE_WEATHER_API_KEY missing/blank), using Open-Meteo directly for {},{}", latitude, longitude);
        }

        log.debug("Attempting Open-Meteo for {},{}", latitude, longitude);
        try {
            WeatherDto dto = openMeteoClient.getCurrentWeather(latitude, longitude);
            log.debug("Open-Meteo succeeded for {},{}", latitude, longitude);
            return dto;
        } catch (Exception e) {
            log.error("Open-Meteo weather also failed ({}): {}", e.getClass().getSimpleName(), e.getMessage());
            log.debug("Open-Meteo failure detail", e);
            throw new ExternalApiException("Weather data unavailable from all providers", e);
        }
    }
}
