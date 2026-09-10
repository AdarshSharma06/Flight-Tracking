package com.flighttracking.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flighttracking.config.GoogleWeatherProperties;
import com.flighttracking.dto.weather.WeatherDto;
import com.flighttracking.exception.ExternalApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;

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
        } catch (RestClientResponseException e) {
            String body = e.getResponseBodyAsString();
            log.warn("Google Weather API HTTP {} for {},{}: {} — body: {}", e.getStatusCode(), latitude, longitude, e.getMessage(), body != null && body.length() > 500 ? body.substring(0, 500) : body);
            throw new ExternalApiException("Google Weather API HTTP " + e.getStatusCode().value() + ": " + e.getMessage(), e);
        } catch (ExternalApiException e) {
            throw e;
        } catch (Exception e) {
            log.error("Google Weather API request failed for {},{} ({}): {}", latitude, longitude, e.getClass().getSimpleName(), e.getMessage());
            log.debug("Google Weather failure detail", e);
            throw new ExternalApiException("Google Weather API error: " + e.getMessage(), e);
        }
    }

    private WeatherDto mapToWeatherDto(GoogleWeatherResponse response, double latitude, double longitude) {
        GoogleWeatherResponse.CurrentConditions current = response.currentConditions;
        if (current == null) {
            throw new ExternalApiException("No current conditions in Google Weather response", 502);
        }

        Double tempC = extractDouble(current.temperature);
        Double humidity = extractDouble(current.humidity);
        Double windSpeedKmh = extractWindSpeed(current);

        String condition = null;
        if (current.weatherCondition != null) {
            if (current.weatherCondition.description != null) {
                if (current.weatherCondition.description.isTextual()) {
                    condition = current.weatherCondition.description.asText();
                } else if (current.weatherCondition.description.isObject() && current.weatherCondition.description.has("text")) {
                    condition = current.weatherCondition.description.get("text").asText();
                }
            }
            if (condition == null && current.weatherCondition.type != null) {
                condition = current.weatherCondition.type.isTextual() ? current.weatherCondition.type.asText() : current.weatherCondition.type.toString();
            }
        }
        String observationTime = current.observationTime != null && current.observationTime.isTextual() ? current.observationTime.asText() : (current.observationTime != null ? current.observationTime.toString() : null);

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

    private Double extractDouble(JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (node.isNumber()) return node.asDouble();
        if (node.isObject()) {
            if (node.has("degrees")) return node.get("degrees").asDouble();
            if (node.has("value")) return node.get("value").asDouble();
            if (node.has("percent")) return node.get("percent").asDouble();
        }
        return null;
    }

    private Double extractWindSpeed(GoogleWeatherResponse.CurrentConditions current) {
        // Direct windSpeed field (Double or object)
        Double direct = extractDouble(current.windSpeed);
        if (direct != null) return direct;
        // Nested wind.speed.value
        if (current.wind != null && current.wind.has("speed")) {
            JsonNode speedNode = current.wind.get("speed");
            Double v = extractDouble(speedNode);
            if (v != null) return v;
            if (speedNode != null && speedNode.isObject() && speedNode.has("value")) {
                return extractDouble(speedNode.get("value"));
            }
        }
        return null;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GoogleWeatherResponse {
        @JsonProperty("currentConditions")
        public CurrentConditions currentConditions;

        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class CurrentConditions {
            @JsonProperty("temperature")
            public JsonNode temperature;

            @JsonProperty("humidity")
            public JsonNode humidity;

            @JsonProperty("wind")
            public JsonNode wind;

            @JsonProperty("windSpeed")
            public JsonNode windSpeed;

            @JsonProperty("weatherCondition")
            public WeatherCondition weatherCondition;

            @JsonProperty("observationTime")
            public JsonNode observationTime;
        }

        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class WeatherCondition {
            @JsonProperty("description")
            public JsonNode description;

            @JsonProperty("type")
            public JsonNode type;
        }
    }
}
