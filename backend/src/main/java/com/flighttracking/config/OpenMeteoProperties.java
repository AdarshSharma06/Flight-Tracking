package com.flighttracking.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.open-meteo")
public record OpenMeteoProperties(
        String baseUrl,
        int timeoutMs
) {
}
