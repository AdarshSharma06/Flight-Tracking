package com.flighttracking.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flighttracking.config.GoogleWeatherProperties;
import com.flighttracking.dto.weather.WeatherDto;
import com.flighttracking.exception.ExternalApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.List;
import java.util.Map;

@Component
public class GoogleWeatherClient {

    private static final Logger log = LoggerFactory.getLogger(GoogleWeatherClient.class);

    private final RestClient restClient;
    private final GoogleWeatherProperties properties;
    private final ObjectMapper objectMapper;

    public GoogleWeatherClient(RestClient googleWeatherRestClient, GoogleWeatherProperties properties, ObjectMapper objectMapper) {
        this.restClient = googleWeatherRestClient;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public boolean isConfigured() {
        return properties.apiKey() != null && !properties.apiKey().isBlank();
    }

    public WeatherDto getCurrentWeather(double latitude, double longitude) {
        if (!isConfigured()) {
            throw new ExternalApiException("Google Weather API key not configured", 503);
        }

        URI uri = UriComponentsBuilder.fromPath("/v1/currentConditions:lookup")
                .queryParam("key", properties.apiKey())
                .queryParam("location.latitude", latitude)
                .queryParam("location.longitude", longitude)
                .build().toUri();

        try {
            log.debug("Calling Google Weather API: {}", uri);
            String json = restClient.get()
                    .uri(uri)
                    .retrieve()
                    .body(String.class);

            if (json == null || json.isBlank()) {
                throw new ExternalApiException("Empty response from Google Weather API", 502);
            }

            GoogleWeatherResponse response = objectMapper.readValue(json, GoogleWeatherResponse.class);
            return mapToWeatherDto(response, latitude, longitude);
        } catch (ExternalApiException e) {
            throw e;
        } catch (Exception e) {
            log.error("Google Weather API request failed: {}", e.getMessage());
            throw new ExternalApiException("Google Weather API error: " + e.getMessage(), e);
        }
    }

    private WeatherDto mapToWeatherDto(GoogleWeatherResponse response, double latitude, double longitude) {
        GoogleWeatherResponse.CurrentConditions current = response.currentConditions;
        if (current == null) {
            throw new ExternalApiException("No current conditions in Google Weather response", 502);
        }

        Double tempC = current.temperature != null ? current.temperature : null;
        Double humidity = current.humidity != null ? current.humidity : null;
        Double windSpeedKmh = current.windSpeed != null ? current.windSpeed : null;
        String condition = current.weatherCondition != null ? current.weatherCondition.description : null;
        String observationTime = current.observationTime != null ? current.observationTime : null;

        return new WeatherDto(
                latitude,
                longitude,
                null,
                tempC != null ? tempC : 0.0,
                null,
                humidity,
                null,
                windSpeedKmh,
                null,
                condition,
                observationTime
        );
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GoogleWeatherResponse {
        @JsonProperty("currentConditions")
        public CurrentConditions currentConditions;

        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class CurrentConditions {
            @JsonProperty("temperature")
            public Double temperature;

            @JsonProperty("humidity")
            public Double humidity;

            @JsonProperty("windSpeed")
            public Double windSpeed;

            @JsonProperty("weatherCondition")
            public WeatherCondition weatherCondition;

            @JsonProperty("observationTime")
            public String observationTime;
        }

        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class WeatherCondition {
            @JsonProperty("description")
            public String description;

            @JsonProperty("type")
            public String type;
        }
    }
}
