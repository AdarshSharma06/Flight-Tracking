package com.flighttracking.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.weatherstack")
public record WeatherstackProperties(
        String apiKey,
        String baseUrl,
        int timeoutMs
) {
}
