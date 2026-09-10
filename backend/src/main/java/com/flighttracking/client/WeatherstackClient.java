package com.flighttracking.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flighttracking.config.WeatherstackProperties;
import com.flighttracking.dto.weather.WeatherDto;
import com.flighttracking.exception.ExternalApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.List;

@Component
public class WeatherstackClient {

    private static final Logger log = LoggerFactory.getLogger(WeatherstackClient.class);

    private final RestClient restClient;
    private final WeatherstackProperties properties;
    private final ObjectMapper objectMapper;

    public WeatherstackClient(RestClient weatherstackRestClient, WeatherstackProperties properties, ObjectMapper objectMapper) {
        this.restClient = weatherstackRestClient;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public boolean isConfigured() {
        return properties.apiKey() != null && !properties.apiKey().isBlank();
    }

    public WeatherDto getCurrentWeather(double latitude, double longitude) {
        if (!isConfigured()) {
            throw new ExternalApiException("Weatherstack API key not configured", 503);
        }
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw new IllegalArgumentException("Invalid coordinates");
        }

        URI uri = UriComponentsBuilder.fromPath("/current")
                .queryParam("access_key", properties.apiKey())
                .queryParam("query", latitude + "," + longitude)
                .build().toUri();

        try {
            log.debug("Calling Weatherstack: {}", uri);
            String json = restClient.get()
                    .uri(uri)
                    .retrieve()
                    .body(String.class);

            if (json == null || json.isBlank()) {
                throw new ExternalApiException("Empty response from Weatherstack", 502);
            }

            WeatherstackResponse response = objectMapper.readValue(json, WeatherstackResponse.class);

            if (response.error != null) {
                throw new ExternalApiException("Weatherstack error: " + response.error.info + " (code " + response.error.code + ")", 502);
            }

            if (response.current == null) {
                throw new ExternalApiException("No current weather in Weatherstack response", 502);
            }

            return mapToWeatherDto(response, latitude, longitude);
        } catch (RestClientResponseException e) {
            String body = e.getResponseBodyAsString();
            log.warn("Weatherstack HTTP {} for {},{}: {} — body: {}", e.getStatusCode(), latitude, longitude, e.getMessage(), body != null && body.length() > 500 ? body.substring(0, 500) : body);
            throw new ExternalApiException("Weatherstack HTTP " + e.getStatusCode().value() + ": " + e.getMessage(), e);
        } catch (ExternalApiException e) {
            throw e;
        } catch (Exception e) {
            log.error("Weatherstack request failed for {},{} ({}): {}", latitude, longitude, e.getClass().getSimpleName(), e.getMessage());
            log.debug("Weatherstack failure detail", e);
            throw new ExternalApiException("Weatherstack error: " + e.getMessage(), e);
        }
    }

    private WeatherDto mapToWeatherDto(WeatherstackResponse response, double latitude, double longitude) {
        WeatherstackResponse.Current c = response.current;
        String condition = null;
        if (c.weatherDescriptions != null && !c.weatherDescriptions.isEmpty()) {
            condition = c.weatherDescriptions.get(0);
        } else if (c.weatherCode != null) {
            condition = "Code " + c.weatherCode;
        }

        return new WeatherDto(
                latitude,
                longitude,
                response.location != null ? response.location.timezoneId : null,
                c.temperature != null ? c.temperature.doubleValue() : 0.0,
                c.feelslike != null ? c.feelslike.doubleValue() : null,
                c.humidity != null ? c.humidity.doubleValue() : null,
                c.precip != null ? c.precip.doubleValue() : null,
                c.windSpeed != null ? c.windSpeed.doubleValue() : null,
                c.weatherCode,
                condition,
                c.observationTime
        );
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class WeatherstackResponse {
        @JsonProperty("current")
        public Current current;

        @JsonProperty("location")
        public Location location;

        @JsonProperty("error")
        public ErrorInfo error;

        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class Current {
            @JsonProperty("observation_time")
            public String observationTime;

            @JsonProperty("temperature")
            public Number temperature;

            @JsonProperty("weather_code")
            public Integer weatherCode;

            @JsonProperty("weather_descriptions")
            public List<String> weatherDescriptions;

            @JsonProperty("wind_speed")
            public Number windSpeed;

            @JsonProperty("precip")
            public Number precip;

            @JsonProperty("humidity")
            public Number humidity;

            @JsonProperty("feelslike")
            public Number feelslike;
        }

        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class Location {
            @JsonProperty("timezone_id")
            public String timezoneId;

            @JsonProperty("name")
            public String name;
        }

        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class ErrorInfo {
            @JsonProperty("code")
            public Integer code;

            @JsonProperty("type")
            public String type;

            @JsonProperty("info")
            public String info;
        }
    }
}
