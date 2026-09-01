package com.flighttracking.client;

import com.flighttracking.config.OpenMeteoProperties;
import com.flighttracking.dto.weather.WeatherDto;
import com.flighttracking.exception.ExternalApiException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;

@Component
public class OpenMeteoClient {

    private static final Logger log = LoggerFactory.getLogger(OpenMeteoClient.class);

    private final RestClient restClient;
    private final OpenMeteoProperties properties;

    public OpenMeteoClient(RestClient openMeteoRestClient, OpenMeteoProperties properties) {
        this.restClient = openMeteoRestClient;
        this.properties = properties;
    }

    public WeatherDto getCurrentWeather(double latitude, double longitude) {
        if (latitude < -90 || latitude > 90) {
            throw new IllegalArgumentException("Latitude must be between -90 and 90");
        }
        if (longitude < -180 || longitude > 180) {
            throw new IllegalArgumentException("Longitude must be between -180 and 180");
        }

        URI uri = UriComponentsBuilder.fromPath("/v1/forecast")
                .queryParam("latitude", latitude)
                .queryParam("longitude", longitude)
                .queryParam("current", "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m")
                .queryParam("timezone", "auto")
                .build().toUri();

        try {
            log.debug("Calling Open-Meteo: {}", uri);
            OpenMeteoResponse response = restClient.get()
                    .uri(uri)
                    .retrieve()
                    .body(OpenMeteoResponse.class);

            if (response == null || response.current == null) {
                throw new ExternalApiException("Empty response from Open-Meteo", 502);
            }

            String condition = mapWeatherCode(response.current.weatherCode);

            return new WeatherDto(
                    response.latitude,
                    response.longitude,
                    response.timezone,
                    response.current.temperature,
                    response.current.apparentTemperature,
                    response.current.humidity != null ? response.current.humidity.doubleValue() : null,
                    response.current.precipitation,
                    response.current.windSpeed,
                    response.current.weatherCode,
                    condition,
                    response.current.time
            );
        } catch (ExternalApiException e) {
            throw e;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (RestClientException e) {
            log.error("Open-Meteo request failed: {}", e.getMessage());
            throw new ExternalApiException("Failed to fetch weather from Open-Meteo: " + e.getMessage(), e);
        }
    }

    private String mapWeatherCode(Integer code) {
        if (code == null) return "Unknown";
        return switch (code) {
            case 0 -> "Clear sky";
            case 1 -> "Mainly clear";
            case 2 -> "Partly cloudy";
            case 3 -> "Overcast";
            case 45, 48 -> "Fog";
            case 51, 53, 55 -> "Drizzle";
            case 56, 57 -> "Freezing Drizzle";
            case 61, 63, 65 -> "Rain";
            case 66, 67 -> "Freezing Rain";
            case 71, 73, 75 -> "Snow fall";
            case 77 -> "Snow grains";
            case 80, 81, 82 -> "Rain showers";
            case 85, 86 -> "Snow showers";
            case 95 -> "Thunderstorm";
            case 96, 99 -> "Thunderstorm with hail";
            default -> "Unknown (" + code + ")";
        };
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class OpenMeteoResponse {
        public double latitude;
        public double longitude;
        @JsonProperty("timezone")
        public String timezone;
        @JsonProperty("current")
        public Current current;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Current {
        public String time;
        @JsonProperty("temperature_2m")
        public double temperature;
        @JsonProperty("apparent_temperature")
        public Double apparentTemperature;
        @JsonProperty("relative_humidity_2m")
        public Integer humidity;
        @JsonProperty("precipitation")
        public Double precipitation;
        @JsonProperty("weather_code")
        public Integer weatherCode;
        @JsonProperty("wind_speed_10m")
        public Double windSpeed;
    }
}
