package com.flighttracking.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.google-weather")
public record GoogleWeatherProperties(
        String apiKey,
        String baseUrl,
        int timeoutMs
) {
}
