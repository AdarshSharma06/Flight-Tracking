package com.flighttracking.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.aerodatabox")
public record AerodataboxProperties(
        String apiKey,
        String baseUrl,
        int timeoutMs
) {
}
